'use strict';
const db=require('../db');
const a=require('./activity');
async function enroll(message) {
  const match=String(message.text||'').match(/^\/enroll ([a-f0-9]{48})$/);
  if(!match) return false;
  if(message.chat?.type!=='private' || String(message.chat.id)!==String(message.from?.id)) return true;
  await a.transaction(async conn=>{
    const [invite]=await conn.query('SELECT i.* FROM telegram_invitations i JOIN operators o ON o.id=i.operator_id WHERE token_hash=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP() AND o.active=1 FOR UPDATE',[a.hash(match[1])]);
    if(!invite) return;
    // Never transfer a chat between operators using an invitation.
    const [existing]=await conn.query('SELECT operator_id FROM telegram_operator_chats WHERE chat_id=?',[String(message.chat.id)]);
    if(existing && String(existing.operator_id)!==String(invite.operator_id)) return;
    await conn.execute('INSERT INTO telegram_operator_chats (chat_id,operator_id,telegram_user_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE authorized=1',[String(message.chat.id),invite.operator_id,String(message.from.id)]);
    await conn.execute('UPDATE telegram_invitations SET used_at=UTC_TIMESTAMP() WHERE token_hash=?',[invite.token_hash]);
    await a.audit({id:invite.operator_id},'telegram.enroll',null,conn);
  });
  return true;
}
function alertText(event) {
  const origin=new URL(process.env.ACTIVITY_ADMIN_URL||'http://localhost:5173').origin;
  return [`New site ${event.event_type==='submission'?'submission':'visit'}`,`Visit ID: ${event.id}`,`Referral: ${event.referral_id ? `Link ${event.referral_id}`:'Direct'}`,`Country: ${event.country||'Unknown'}`,`Device: ${event.device}`,`Browser: ${event.browser}`,`Time: ${new Date(event.created_at).toISOString()}`,`Open: ${origin}/admin/activity/${event.id}`].join('\n');
}
async function send(chatId,text) {
  if(!process.env.TELEGRAM_BOT_TOKEN) return {status:'pending',code:'not_configured',delay:300};
  try {
    const response=await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text,link_preview_options:{is_disabled:true}}),signal:AbortSignal.timeout(10000)});
    const result=await response.json();
    if(result.ok) return {status:'sent',code:null,delay:0};
    if(result.error_code===429) return {status:'pending',code:'rate_limited',delay:Math.min(86400,Math.max(1,Number(result.parameters?.retry_after)||60))};
    return {status:result.error_code>=500?'pending':'failed',code:'telegram_rejected',delay:60};
  } catch { return {status:'failed',code:'delivery_unknown',delay:0}; }
}
async function tick(sender=send) {
  // A database lock serializes workers; abandoned sends are not retried because Telegram
  // has no idempotency key and a timeout may mean the message was accepted.
  const conn=await db.getConnection();
  try {
    const [lock]=await conn.query("SELECT GET_LOCK('activity_delivery_worker',0) AS acquired");
    if(!lock.acquired) return;
    await conn.execute("UPDATE telegram_alert_deliveries SET status='failed',error_code='delivery_unknown' WHERE status='sending' AND updated_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE)");
    await conn.execute('DELETE FROM activity_events WHERE expires_at<=UTC_TIMESTAMP()');
    await conn.execute('DELETE FROM activity_sessions WHERE expires_at<=UTC_TIMESTAMP()');
    await conn.execute('DELETE FROM telegram_invitations WHERE expires_at<=UTC_TIMESTAMP()');
    await conn.execute('DELETE FROM audit_events WHERE created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 DAY)');
    if(sender===send && !process.env.TELEGRAM_BOT_TOKEN) return;
    const rows=await conn.query("SELECT id FROM telegram_alert_deliveries WHERE status='pending' AND next_attempt_at<=UTC_TIMESTAMP() ORDER BY id LIMIT 20");
    for(const row of rows) {
      const [delivery]=await conn.query(`SELECT d.*,e.event_type,e.created_at,e.referral_id,e.country,e.device,e.browser,e.id AS visit_id,
        c.authorized,o.active,o.role,o.id AS operator_id,r.operator_id AS assigned_id
        FROM telegram_alert_deliveries d JOIN activity_events e ON e.id=d.event_id JOIN telegram_operator_chats c ON c.chat_id=d.chat_id JOIN operators o ON o.id=c.operator_id LEFT JOIN referral_links r ON r.id=e.referral_id WHERE d.id=?`,[row.id]);
      if(!delivery) continue;
      if(!delivery.authorized||!delivery.active||(delivery.role==='level2'&&String(delivery.operator_id)!==String(delivery.assigned_id))) {
        await conn.execute("UPDATE telegram_alert_deliveries SET status='cancelled' WHERE id=?",[row.id]); continue;
      }
      await conn.execute("UPDATE telegram_alert_deliveries SET status='sending',attempts=attempts+1 WHERE id=? AND status='pending'",[row.id]);
      const result=await sender(delivery.chat_id,alertText({...delivery,id:delivery.visit_id}));
      const status=result.status==='pending'&&delivery.attempts>=4?'failed':result.status;
      await conn.execute('UPDATE telegram_alert_deliveries SET status=?,error_code=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND) WHERE id=?',[status,result.code,Math.max(result.delay,2**delivery.attempts*30),row.id]);
    }
  } finally { await conn.query("SELECT RELEASE_LOCK('activity_delivery_worker')");conn.release(); }
}
module.exports={enroll,alertText,tick,send};
