'use strict';
// Creates and drops uniquely named test databases; never migrates the configured database.
require('dotenv').config();
const mysql=require('mysql2/promise');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const names=[`activity_test_clean_${crypto.randomBytes(6).toString('hex')}`,`activity_test_upgrade_${crypto.randomBytes(6).toString('hex')}`];
let adminConnection,db,server;
function migrate(name){execFileSync(process.execPath,['scripts/migrate.js'],{cwd:root,env:{...process.env,DB_NAME:name},stdio:'pipe'});}
(async()=>{
  adminConnection=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||''});
  for(const name of names) await adminConnection.query(`CREATE DATABASE \`${name}\``);
  migrate(names[0]);migrate(names[0]);
  await adminConnection.query(`USE \`${names[1]}\``);
  for(const file of fs.readdirSync(path.join(root,'sql')).filter(f=>f.endsWith('.sql')&&f<'009').sort()) {
    for(const sql of fs.readFileSync(path.join(root,'sql',file),'utf8').split(/;\s*(?:\r?\n|$)/).map(s=>s.trim()).filter(Boolean)) {
      try {await adminConnection.query(sql);}catch(e){if(!/duplicate column|duplicate key|duplicate.*index/i.test(e.message)) throw e;}
    }
  }
  migrate(names[1]);migrate(names[1]);
  for(const name of names) {
    const [rows]=await adminConnection.query(`SELECT COUNT(*) AS count FROM \`${name}\`.schema_migrations`);
    assert.equal(rows[0].count,9);
  }
  console.log('PASS clean install, legacy upgrade and repeated migration');
  process.env.DB_NAME=names[0];process.env.ACTIVITY_SIGNING_SECRET=crypto.randomBytes(32).toString('hex');
  db=require('../db');
  const app=require('../server');
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const credentials={one:['admin@admin.com','123456'],two:['two@example.test','test-password-222'],three:['three@example.test','test-password-333']};
  async function request(url,{who='one',method='GET',body,status=200}={}) {
    const headers={'Content-Type':'application/json'};
    if(who){headers['x-admin-email']=credentials[who][0];headers['x-admin-password']=credentials[who][1];}
    const response=await fetch(origin+url,{method,headers,body:body?JSON.stringify(body):undefined});
    const result=await response.json();assert.equal(response.status,status,`${method} ${url}: ${JSON.stringify(result)}`);return result;
  }
  for(const who of ['two','three']) await request('/api/activity/operators',{method:'POST',status:201,body:{email:credentials[who][0],password:credentials[who][1],name:who,role:'level2'}});
  const settings=await request('/api/activity/settings');const ops=settings.operators;
  const one=ops.find(o=>o.role==='level1'),two=ops.find(o=>o.email===credentials.two[0]),three=ops.find(o=>o.email===credentials.three[0]);
  const invite=await request('/api/activity/invitations',{method:'POST',body:{operatorId:two.id}});
  const telegram=require('../services/activityTelegram');
  await telegram.enroll({text:invite.command,chat:{type:'private',id:222},from:{id:222}});
  await telegram.enroll({text:invite.command,chat:{type:'private',id:999},from:{id:999}});
  assert.equal((await db.query('SELECT * FROM telegram_operator_chats')).length,1);
  await db.execute('INSERT INTO telegram_operator_chats (chat_id,operator_id,telegram_user_id) VALUES (?,?,?),(?,?,?)',['111',one.id,'111','333',three.id,'333']);
  const ref=await request('/api/activity/referrals',{method:'POST',status:201,body:{name:'Campaign',operatorId:two.id}});
  const unassigned=await request('/api/activity/referrals',{method:'POST',status:201,body:{name:'Unassigned'}});
  const states=[];
  for(const referral of [null,ref.code,unassigned.code]) {
    const {state}=await request('/api/activity/state',{who:null,method:'POST',body:{consent:'granted',referral}});states.push(state);
    for(let repeat=0;repeat<2;repeat++) await request('/api/activity/visit',{who:null,method:'POST',status:202,body:{state,consent:'granted',page:'/',password:'NEVER_STORE_THIS',metadata:{seed:'NEVER_STORE_THIS'}}});
  }
  const all=await request('/api/activity');assert.equal(all.totals.total,3);
  assert.equal((await request('/api/activity',{who:'two'})).totals.total,1);
  assert.equal((await request('/api/activity',{who:'three'})).totals.total,0);
  const own=(await request('/api/activity',{who:'two'})).events[0];
  await request(`/api/activity/${own.id}`,{who:'three',status:404});
  await request(`/api/activity?operator=${one.id}&role=level1`,{who:'three'}).then(r=>assert.equal(r.totals.total,0));
  await request('/api/activity/export',{who:'two',status:403});
  await request('/api/activity/settings',{who:'two',status:403});
  await request('/api/words',{who:'two',status:401});
  await request('/api/activity',{who:null,status:401});
  const deliveries=await db.query('SELECT * FROM telegram_alert_deliveries');assert.equal(deliveries.length,4);
  assert.equal(deliveries.filter(d=>d.chat_id==='222').length,1);assert.equal(deliveries.filter(d=>d.chat_id==='333').length,0);
  assert.ok(!JSON.stringify(await db.query('SELECT * FROM activity_events')).includes('NEVER_STORE_THIS'));
  let sent=0;await telegram.tick(async(chat,text)=>{assert.ok(!text.includes('NEVER_STORE_THIS'));sent++;return {status:'sent',code:null,delay:0};});
  assert.equal(sent,4);await telegram.tick(async()=>{throw new Error('must not redeliver');});
  const [r]=await db.query('SELECT id FROM referral_links WHERE code=?',[ref.code]);
  await request(`/api/activity/referrals/${r.id}`,{method:'PUT',body:{operatorId:three.id,active:true}});
  assert.equal((await request('/api/activity',{who:'two'})).totals.total,0);
  assert.equal((await request('/api/activity',{who:'three'})).totals.total,1);
  await request(`/api/activity/${own.id}`,{who:'two',status:404});
  // A reassignment must cancel a previously queued Level 2 delivery.
  await db.execute("UPDATE telegram_alert_deliveries SET status='pending',next_attempt_at=UTC_TIMESTAMP() WHERE chat_id='222'");
  await telegram.tick(async()=>{throw new Error('must not send to old assignee');});
  assert.equal((await db.query("SELECT status FROM telegram_alert_deliveries WHERE chat_id='222'"))[0].status,'cancelled');
  // Explicit Telegram rate-limit failures retry only within the attempt budget.
  const [retry]=await db.query("SELECT id FROM telegram_alert_deliveries WHERE chat_id='111' LIMIT 1");
  await db.execute("UPDATE telegram_alert_deliveries SET status='pending',attempts=4,next_attempt_at=UTC_TIMESTAMP() WHERE id=?",[retry.id]);
  await telegram.tick(async()=>({status:'pending',code:'rate_limited',delay:60}));
  assert.equal((await db.query('SELECT status,attempts FROM telegram_alert_deliveries WHERE id=?',[retry.id]))[0].status,'failed');
  // Expired enrollment is never accepted.
  const expired=await request('/api/activity/invitations',{method:'POST',body:{operatorId:three.id}});
  await db.execute('UPDATE telegram_invitations SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND)');
  await telegram.enroll({text:expired.command,chat:{type:'private',id:999},from:{id:999}});
  assert.equal((await db.query("SELECT * FROM telegram_operator_chats WHERE chat_id='999'")).length,0);
  await request('/api/activity/export');assert.ok((await db.query("SELECT * FROM audit_events WHERE action='activity.export'")).length);
  await request('/api/activity/withdraw',{who:null,method:'POST',body:{state:states[0]}});
  assert.equal((await request('/api/activity')).totals.total,2);
  await request('/api/activity/visit',{who:null,method:'POST',status:400,body:{state:states[0],consent:'granted',page:'/'}});
  await db.execute('UPDATE activity_events SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY)');
  await telegram.tick(async()=>{throw new Error('must not send expired event');});
  assert.equal((await db.query('SELECT * FROM activity_events')).length,0);
  assert.equal((await db.query('SELECT * FROM telegram_alert_deliveries')).length,0);
  console.log('PASS consent, privacy, deduplication, direct/unassigned routing, Level 2 isolation, reassignment, enrollment replay, export audit, idempotent queue and retention');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
  if(server) await new Promise(resolve=>server.close(resolve));
  if(db) await db.end();
  if(adminConnection){for(const name of names) await adminConnection.query(`DROP DATABASE IF EXISTS \`${name}\``);await adminConnection.end();}
});
