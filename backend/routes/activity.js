'use strict';
// God's Eye activity routes: handle consented visit tracking, admin access, operators, referrals, and Telegram enrollment.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const a = require('../services/activity');
const router = express.Router();
const buckets = new Map();
const salt=crypto.randomBytes(32);
function rateLimit(req,res,next) {
  const now=Date.now();
  for(const [key,value] of buckets) if(value.until<now) buckets.delete(key);
  const key=crypto.createHmac('sha256',salt).update(req.ip||'unknown').digest('hex');
  const value=buckets.get(key)||{count:0,until:now+60000};
  if(++value.count>60 || (!buckets.has(key) && buckets.size>=10000)) return res.status(429).json({error:'Too many requests'});
  buckets.set(key,value); next();
}
function missingTelegramChatColumn(error) {
  return /telegram_chat_id/i.test(error.message || '');
}
function nullAdminIdRejected(error) {
  return /admin_id/i.test(error.message || '') && /null|no default|cannot be null/i.test(error.message || '');
}
async function listTelegramUsers() {
  try {
    return await db.query(`SELECT t.chat_id,t.telegram_user_id,t.username,t.first_name,t.last_name,t.authorized,
      o.id AS operator_id,o.role,o.active
      FROM telegram_admin_chats t
      LEFT JOIN operators o ON o.telegram_chat_id=t.chat_id
      ORDER BY t.updated_at DESC,t.chat_id`);
  } catch (error) {
    if (!missingTelegramChatColumn(error)) throw error;
    return db.query(`SELECT t.chat_id,t.telegram_user_id,t.username,t.first_name,t.last_name,t.authorized,
      o.id AS operator_id,o.role,o.active
      FROM telegram_admin_chats t
      LEFT JOIN telegram_operator_chats c ON c.chat_id=t.chat_id
      LEFT JOIN operators o ON o.id=c.operator_id
      ORDER BY t.updated_at DESC,t.chat_id`);
  }
}
// Apply per-IP request limits to every activity endpoint.
router.use(rateLimit);
// Prevent browsers and proxies from caching private activity responses.
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
// Create a signed activity session after the visitor grants consent.
router.post('/state',async(req,res)=>{
  if(req.body?.consent!=='granted') return res.status(400).json({error:'Consent required'});
  let referral=null;
  if(req.body.referral) {
    if(!/^[a-f0-9]{24}$/.test(req.body.referral)) throw a.fail(400,'Invalid referral');
    const [row]=await db.query('SELECT id FROM referral_links WHERE code=? AND active=1',[req.body.referral]);
    if(!row) throw a.fail(404,'Referral was not found');
    referral=row.id;
  }
  const state=a.signState(referral);
  const payload=a.verifyState(state);
  await db.execute('INSERT INTO activity_sessions (session_id,expires_at) VALUES (?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY))',[payload.session]);
  res.json({state});
});
// Record a consented public visit for the God's Eye activity feed.
router.post('/visit',async(req,res)=>{await a.record(req);res.status(202).json({ok:true});});
// Withdraw consent, revoke the activity session, and delete its recorded events.
router.post('/withdraw',async(req,res)=>{
  const state=a.verifyState(req.body?.state);
  if(!state) throw a.fail(400,'Invalid activity state');
  await a.transaction(async conn=>{
    await conn.execute('UPDATE activity_sessions SET revoked=1 WHERE session_id=?',[state.session]);
    await conn.execute('DELETE FROM activity_events WHERE session_id=?',[state.session]);
  });
  res.json({ok:true});
});
// Authenticate the operator before allowing access to the protected routes below.
router.use(async(req,res,next)=>{req.operator=await a.actor(req);next();});
// List activity events using the authenticated operator's permitted scope.
router.get('/',async(req,res)=>{const result=await a.list(req.operator,req.query);await a.audit(req.operator,'activity.list',null);res.json(result);});
// Export scoped activity records as JSON for Level 1 administrators.
router.get('/export',async(req,res)=>{
  a.level1(req.operator);
  const result=await a.list(req.operator,req.query,true);
  await a.audit(req.operator,'activity.export',result.events.length);
  res.attachment('activity.json').json(result);
});
// List audit events visible to the authenticated operator.
router.get('/audit',async(req,res)=>{
  const page=Math.max(1,Number.parseInt(req.query.page,10)||1);
  const rows=await db.query(`SELECT id,actor_id,action,target,created_at FROM audit_events ${req.operator.role==='level2'?'WHERE actor_id=?':''} ORDER BY id DESC LIMIT 50 OFFSET ?`,[...(req.operator.role==='level2'?[req.operator.id]:[]),(page-1)*50]);
  res.json({events:rows});
});
// Load Level 1 settings for operators and referral links.
router.get('/settings',async(req,res)=>{
  a.level1(req.operator);
  const operators=await db.query('SELECT o.id,o.role,o.active,u.name,u.email FROM operators o JOIN admin_users u ON u.id=o.admin_id');
  const telegramUsers=await listTelegramUsers();
  const referrals=await db.query('SELECT id,code,name,operator_id,active FROM referral_links ORDER BY id DESC');
  res.json({operators,telegramUsers,referrals});
});
// Read existing Telegram admins directly from the database for the Operators page.
router.get('/telegram-users',async(req,res)=>{
  a.level1(req.operator);
  const [telegramUsers,referrals]=await Promise.all([
    listTelegramUsers(),
    db.query('SELECT id,code,name,operator_id,active FROM referral_links ORDER BY id DESC'),
  ]);
  res.json({telegramUsers,referrals});
});
// Assign or update God's Eye access for a Telegram user registered through /start.
router.put('/telegram-users/:chatId/access',async(req,res)=>{
  a.level1(req.operator);
  const chatId=String(req.params.chatId||'');
  const {role,active}=req.body;
  if(!/^-?\d{1,20}$/.test(chatId)) throw a.fail(400,'Valid Telegram chat required');
  if(!['level1','level2'].includes(role) || typeof active!=='boolean') throw a.fail(400,'Valid role and active status required');
  await a.transaction(async conn=>{
    const [chat]=await conn.query('SELECT chat_id,telegram_user_id FROM telegram_admin_chats WHERE chat_id=? FOR UPDATE',[chatId]);
    if(!chat) throw a.fail(404,'Telegram user was not found. Ask the user to send /start to the bot.');
    let operator=null;
    try {
      [operator]=await conn.query('SELECT id FROM operators WHERE telegram_chat_id=? FOR UPDATE',[chatId]);
    } catch (error) {
      if(!missingTelegramChatColumn(error)) throw error;
    }
    if(!operator) {
      [operator]=await conn.query('SELECT o.id FROM operators o JOIN telegram_operator_chats c ON c.operator_id=o.id WHERE c.chat_id=? FOR UPDATE',[chatId]);
    }
    let operatorId=operator?.id;
    if(operatorId) {
      try {
        await conn.execute('UPDATE operators SET telegram_chat_id=?,role=?,active=? WHERE id=?',[chatId,role,active,operatorId]);
      } catch (error) {
        if(!missingTelegramChatColumn(error)) throw error;
        await conn.execute('UPDATE operators SET role=?,active=? WHERE id=?',[role,active,operatorId]);
      }
    } else {
      try {
        const result=await conn.execute('INSERT INTO operators (admin_id,telegram_chat_id,role,active) VALUES (NULL,?,?,?)',[chatId,role,active]);
        operatorId=result.insertId;
      } catch (error) {
        if(missingTelegramChatColumn(error) || nullAdminIdRejected(error)) throw a.fail(503,'Live database migration 010 is required before approving new Telegram admins');
        throw error;
      }
    }
    await conn.execute(`INSERT INTO telegram_operator_chats (chat_id,operator_id,telegram_user_id,authorized)
      VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE operator_id=VALUES(operator_id),telegram_user_id=VALUES(telegram_user_id),authorized=VALUES(authorized)`,
      [chatId,operatorId,String(chat.telegram_user_id||chatId),active]);
    if(role==='level1' || !active) await conn.execute('UPDATE referral_links SET operator_id=NULL WHERE operator_id=?',[operatorId]);
    await conn.execute('UPDATE telegram_admin_chats SET authorized=? WHERE chat_id=?',[active,chatId]);
    await a.audit(req.operator,'telegram.access',chatId,conn);
  });
  res.json({ok:true});
});
// Create a new Level 1 or Level 2 operator account.
router.post('/operators',async(req,res)=>{
  a.level1(req.operator);
  const {email,name,password,role}=req.body;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'') || typeof name!=='string'||name.length>80 || typeof password!=='string'||password.length<12 || !['level1','level2'].includes(role)) throw a.fail(400,'Valid email, name, role and password of at least 12 characters required');
  await a.transaction(async conn=>{
    const user=await conn.execute('INSERT INTO admin_users (email,name,password_hash) VALUES (?,?,?)',[email.toLowerCase(),name,a.hash(password)]);
    const operator=await conn.execute('INSERT INTO operators (admin_id,role) VALUES (?,?)',[user.insertId,role]);
    await a.audit(req.operator,'operator.create',operator.insertId,conn);
  });
  res.status(201).json({ok:true});
});
// Activate or deactivate an operator account.
router.post('/operators/:id/status',async(req,res)=>{
  a.level1(req.operator);
  if(String(req.operator.id)===req.params.id) throw a.fail(400,'Cannot deactivate yourself');
  if(typeof req.body.active!=='boolean') throw a.fail(400,'Boolean active required');
  await a.transaction(async conn=>{await conn.execute('UPDATE operators SET active=? WHERE id=?',[req.body.active,req.params.id]);await a.audit(req.operator,'operator.status',req.params.id,conn);});
  res.json({ok:true});
});
// Generate a short-lived Telegram enrollment invitation for an operator.
router.post('/invitations',async(req,res)=>{
  a.level1(req.operator);
  const [operator]=await db.query('SELECT id FROM operators WHERE id=? AND active=1',[req.body.operatorId]);
  if(!operator) throw a.fail(400,'Active operator required');
  const token=crypto.randomBytes(24).toString('hex');
  await a.transaction(async conn=>{
    await conn.execute('DELETE FROM telegram_invitations WHERE operator_id=?',[operator.id]);
    await conn.execute('INSERT INTO telegram_invitations (token_hash,operator_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))',[a.hash(token),operator.id]);
    await a.audit(req.operator,'telegram.invite',operator.id,conn);
  });
  res.json({command:`/enroll ${token}`,expiresInSeconds:900});
});
// Create a referral link with an optional Level 2 operator assignment.
router.post('/referrals',async(req,res)=>{
  a.level1(req.operator);
  const name=String(req.body.name||'').trim();
  if(!/^[\p{L}\p{N} _-]{1,80}$/u.test(name)) throw a.fail(400,'Use a short campaign name with letters, numbers, spaces or dashes');
  const operatorId=req.body.operatorId||null;
  if(operatorId && !(await db.query("SELECT id FROM operators WHERE id=? AND active=1 AND role='level2'",[operatorId])).length) throw a.fail(400,'Active Level 2 operator required');
  const code=crypto.randomBytes(12).toString('hex');
  await a.transaction(async conn=>{const result=await conn.execute('INSERT INTO referral_links (code,name,operator_id) VALUES (?,?,?)',[code,name,operatorId]);await a.audit(req.operator,'referral.create',result.insertId,conn);});
  res.status(201).json({code,path:`/?ref=${code}`});
});
// Change a referral link's operator assignment or active status.
router.put('/referrals/:id',async(req,res)=>{
  a.level1(req.operator);
  const operatorId=req.body.operatorId||null;
  if(typeof req.body.active!=='boolean') throw a.fail(400,'Boolean active required');
  if(operatorId && !(await db.query("SELECT id FROM operators WHERE id=? AND active=1 AND role='level2'",[operatorId])).length) throw a.fail(400,'Active Level 2 operator required');
  await a.transaction(async conn=>{await conn.execute('UPDATE referral_links SET operator_id=?,active=? WHERE id=?',[operatorId,req.body.active,req.params.id]);await a.audit(req.operator,'referral.update',req.params.id,conn);});
  res.json({ok:true});
});
// Return one activity event and its permitted delivery details.
router.get('/:id',async(req,res)=>{const data=await a.detail(req.operator,req.params.id);await a.audit(req.operator,'activity.view',req.params.id);res.json(data);});
// Permanently delete one activity event as a Level 1 administrator.
router.delete('/:id',async(req,res)=>{
  a.level1(req.operator);
  await a.transaction(async conn=>{await conn.execute('DELETE FROM activity_events WHERE id=?',[req.params.id]);await a.audit(req.operator,'activity.delete',req.params.id,conn);});
  res.json({ok:true});
});
// Convert activity-route errors into safe JSON responses.
router.use((error,req,res,next)=>{res.status(error.status||500).json({error:error.status?error.message:'Activity request failed'});});
module.exports=router;
module.exports.rateLimit=rateLimit;
