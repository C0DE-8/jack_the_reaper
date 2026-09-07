'use strict';
const crypto = require('crypto');
const db = require('../db');
const { verifyAdminCredentials } = require('./admin');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
const pages = new Set(['/','/index.html']);
function safeEvent(body, ua = '') {
  if (body?.consent !== 'granted' || !pages.has(body.page) || /bot|crawler|spider|headless|health|uptime/i.test(ua)) return null;
  return {
    page: body.page,
    device: /tablet|ipad/i.test(ua) ? 'Tablet' : /mobile|android|iphone/i.test(ua) ? 'Mobile' : 'Desktop',
    browser: /edg\//i.test(ua) ? 'Edge' : /firefox/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'Other',
    os: /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iOS' : /windows/i.test(ua) ? 'Windows' : /macintosh/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : 'Other',
    consent: 'granted',
  };
}
async function actor(req) {
  // Web admins are super admins for the activity console. Telegram admins are managed separately.
  const admin = await verifyAdminCredentials(req.get('x-admin-email'), req.get('x-admin-password'));
  if (!admin?.id) throw fail(401, 'Database admin authentication required');
  const rows = await db.query('SELECT id, role FROM operators WHERE admin_id = ? AND active = 1', [admin.id]);
  return rows[0] || { id: null, admin_id: admin.id, role: 'level1', active: true };
}
function scope(operator, alias = 'e') {
  return operator.role === 'level1' ? { sql: '1=1', params: [] } : {
    sql: `EXISTS (SELECT 1 FROM referral_links scoped WHERE scoped.id = ${alias}.referral_id AND scoped.operator_id = ?)`, params: [operator.id],
  };
}
function level1(operator) { if (operator.role !== 'level1') throw fail(403, 'Level 1 required'); }
async function audit(operator, action, target, conn = db) {
  if (!operator?.id) return;
  await conn.execute('INSERT INTO audit_events (actor_id, action, target) VALUES (?, ?, ?)', [operator.id, action, target == null ? null : String(target)]);
}
async function transaction(fn) {
  const conn = await db.getConnection();
  try { await conn.beginTransaction(); const value = await fn(conn); await conn.commit(); return value; }
  catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}
async function record(req, eventType = 'visit') {
  const safe = safeEvent(req.body, req.get('user-agent'));
  if (!safe) return null;
  const state = verifyState(req.body.state);
  if (!state) throw fail(400, 'Valid activity state required');
  const referral = state.referral ? (await db.query('SELECT id FROM referral_links WHERE id = ? AND active = 1', [state.referral]))[0]?.id || null : null;
  const location = require('geoip-lite').lookup(req.ip || '');
  const country = /^[A-Z]{2}$/.test(location?.country || '') ? location.country : null;
  const id = crypto.randomUUID();
  const dedup = hash(`${state.session}:${safe.page}:${eventType}:${Math.floor(Date.now()/300000)}`);
  // No IP, URL query, user-agent, request body, or submission content is stored.
  await transaction(async conn => {
    const [session]=await conn.query('SELECT revoked FROM activity_sessions WHERE session_id=? AND expires_at>UTC_TIMESTAMP() FOR UPDATE',[state.session]);
    if(!session || session.revoked) throw fail(400,'Activity consent is no longer active');
    const result = await conn.execute(`INSERT IGNORE INTO activity_events
      (id,event_type,session_id,page,referral_id,country,device,browser,os,consent,dedup_key,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))`,
    [id,eventType,state.session,safe.page,referral,country,safe.device,safe.browser,safe.os,safe.consent,dedup]);
    if (!result.affectedRows) return;
    await conn.execute(`INSERT IGNORE INTO telegram_alert_deliveries (event_id,chat_id)
      SELECT ?, c.chat_id FROM telegram_operator_chats c JOIN operators o ON o.id=c.operator_id
      WHERE c.authorized=1 AND o.active=1 AND (o.role='level1' OR
        (o.role='level2' AND EXISTS (SELECT 1 FROM referral_links r WHERE r.id=? AND r.operator_id=o.id)))`, [id,referral]);
  });
  return id;
}
function secret() { if (!process.env.ACTIVITY_SIGNING_SECRET || process.env.ACTIVITY_SIGNING_SECRET.length < 32) throw fail(503,'Activity signing secret is not configured'); return process.env.ACTIVITY_SIGNING_SECRET; }
function signState(referral = null) {
  const payload = Buffer.from(JSON.stringify({session:crypto.randomUUID(),referral,expires:Date.now()+86400000})).toString('base64url');
  return `${payload}.${crypto.createHmac('sha256',secret()).update(payload).digest('base64url')}`;
}
function verifyState(token) {
  if (typeof token !== 'string' || token.length > 512) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = crypto.createHmac('sha256',secret()).update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) return null;
  try { const value=JSON.parse(Buffer.from(payload,'base64url')); return value.expires > Date.now() ? value : null; } catch { return null; }
}
function filters(operator, query) {
  const base=scope(operator); const clauses=[base.sql]; const params=[...base.params];
  for (const [key,column] of Object.entries({type:'e.event_type',referral:'e.referral_id',country:'e.country',operator:'r.operator_id'})) {
    if (query[key]) { clauses.push(`${column} = ?`); params.push(String(query[key]).slice(0,80)); }
  }
  for (const [key,op] of [['from','>='],['to','<=']]) {
    if (query[key]) { if (!/^\d{4}-\d{2}-\d{2}$/.test(query[key]) || !Number.isFinite(Date.parse(query[key]))) throw fail(400,'Invalid date'); clauses.push(`DATE(e.created_at) ${op} ?`); params.push(query[key]); }
  }
  if(query.delivery) { clauses.push('EXISTS (SELECT 1 FROM telegram_alert_deliveries d JOIN telegram_operator_chats c ON c.chat_id=d.chat_id WHERE d.event_id=e.id AND d.status=?'+(operator.role==='level2'?' AND c.operator_id=?':'')+')'); params.push(query.delivery); if(operator.role==='level2') params.push(operator.id); }
  return { sql:clauses.join(' AND '), params };
}
async function list(operator, query = {}, exporting = false) {
  const f=filters(operator,query); const page=Math.max(1,Math.min(100000,Number.parseInt(query.page,10)||1));
  const size=exporting?10000:25;
  const events=await db.query(`SELECT e.id,e.event_type,e.created_at,e.session_id,e.page,e.referral_id,e.country,e.device,e.browser,e.os,e.consent,r.name AS referral_name
    FROM activity_events e LEFT JOIN referral_links r ON r.id=e.referral_id WHERE ${f.sql} ORDER BY e.created_at DESC,e.id DESC LIMIT ? OFFSET ?`,[...f.params,size,exporting?0:(page-1)*size]);
  const [totals]=await db.query(`SELECT COUNT(*) AS total, COALESCE(SUM(e.event_type='visit'),0) AS visits, COALESCE(SUM(e.event_type='submission'),0) AS submissions FROM activity_events e LEFT JOIN referral_links r ON r.id=e.referral_id WHERE ${f.sql}`,f.params);
  const deliveries=await db.query(`SELECT d.status,COUNT(*) AS total FROM telegram_alert_deliveries d JOIN activity_events e ON e.id=d.event_id LEFT JOIN referral_links r ON r.id=e.referral_id JOIN telegram_operator_chats c ON c.chat_id=d.chat_id WHERE ${f.sql}${operator.role==='level2'?' AND c.operator_id=?':''} GROUP BY d.status`,[...f.params,...(operator.role==='level2'?[operator.id]:[])]);
  return {events,totals,deliveries,page,pageSize:size,role:operator.role};
}
async function detail(operator,id) {
  const s=scope(operator);
  const [event]=await db.query(`SELECT e.id,e.event_type,e.created_at,e.session_id,e.page,e.referral_id,e.country,e.device,e.browser,e.os,e.consent,r.name AS referral_name FROM activity_events e LEFT JOIN referral_links r ON r.id=e.referral_id WHERE e.id=? AND ${s.sql}`,[id,...s.params]);
  if(!event) throw fail(404,'Activity was not found');
  const deliveries=await db.query(`SELECT d.status,d.attempts,d.error_code,d.updated_at FROM telegram_alert_deliveries d JOIN telegram_operator_chats c ON c.chat_id=d.chat_id WHERE d.event_id=?${operator.role==='level2'?' AND c.operator_id=?':''}`,[id,...(operator.role==='level2'?[operator.id]:[])]);
  return {event,deliveries};
}
module.exports={hash,fail,safeEvent,actor,scope,level1,audit,transaction,record,signState,verifyState,filters,list,detail};
