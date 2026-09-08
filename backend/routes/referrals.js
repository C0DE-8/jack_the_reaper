'use strict';

const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { verifyAdminCredentials } = require('../services/admin');

const router = express.Router();

router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(async (req, res, next) => {
  const admin = await verifyAdminCredentials(req.get('x-admin-email'), req.get('x-admin-password'));
  if (!admin?.id) return res.status(401).json({ error: 'Admin authentication required' });
  next();
});

// GET /api/referrals - List referral links
router.get('/', async (req, res) => {
  res.json({ referrals: await db.query('SELECT id,code,name,active,created_at FROM referral_links ORDER BY id DESC') });
});

// GET /api/referrals/telegram-users - List Telegram users and referral assignments
router.get('/telegram-users', async (req, res) => {
  const [telegramUsers, referrals, assignments] = await Promise.all([
    db.query('SELECT chat_id,username,first_name,last_name,authorized,alert_level FROM telegram_admin_chats ORDER BY updated_at DESC'),
    db.query('SELECT id,code,name,active,created_at FROM referral_links ORDER BY id DESC'),
    db.query('SELECT chat_id,referral_id FROM telegram_referral_assignments'),
  ]);
  res.json({ telegramUsers, referrals, assignments });
});

// PUT /api/referrals/telegram-users/:chatId - Update Telegram user access
router.put('/telegram-users/:chatId', async (req, res) => {
  const chatId = String(req.params.chatId || '');
  const { alertLevel, authorized, referralIds = [] } = req.body || {};
  if (!/^-?\d{1,20}$/.test(chatId) || !['level1', 'level2'].includes(alertLevel) || typeof authorized !== 'boolean' || !Array.isArray(referralIds)) return res.status(400).json({ error: 'Valid Telegram access settings required' });
  const ids = [...new Set(referralIds.map(Number).filter(Number.isSafeInteger))];
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const users = await conn.query('SELECT chat_id FROM telegram_admin_chats WHERE chat_id=? FOR UPDATE', [chatId]);
    if (!users.length) return res.status(404).json({ error: 'Telegram user was not found' });
    await conn.execute('UPDATE telegram_admin_chats SET authorized=?,alert_level=? WHERE chat_id=?', [authorized, alertLevel, chatId]);
    await conn.execute('DELETE FROM telegram_referral_assignments WHERE chat_id=?', [chatId]);
    if (alertLevel === 'level2' && ids.length) {
      const valid = await conn.query(`SELECT id FROM referral_links WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
      if (valid.length !== ids.length) throw Object.assign(new Error('One or more referral links were not found'), { status: 400 });
      for (const id of ids) await conn.execute('INSERT INTO telegram_referral_assignments (chat_id,referral_id) VALUES (?,?)', [chatId, id]);
    }
    await conn.commit(); res.json({ ok: true });
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
});

// POST /api/referrals - Create a referral link
router.post('/', async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!/^[\p{L}\p{N} _-]{1,80}$/u.test(name)) return res.status(400).json({ error: 'Use a short campaign name with letters, numbers, spaces or dashes' });
  const code = crypto.randomBytes(12).toString('hex');
  await db.execute('INSERT INTO referral_links (code,name) VALUES (?,?)', [code, name]);
  res.status(201).json({ code, path: `/?ref=${code}` });
});

// PUT /api/referrals/:id - Update a referral link
router.put('/:id', async (req, res) => {
  if (typeof req.body.active !== 'boolean') return res.status(400).json({ error: 'Boolean active required' });
  await db.execute('UPDATE referral_links SET active=? WHERE id=?', [req.body.active, req.params.id]);
  res.json({ ok: true });
});

router.use((error, req, res, next) => {
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Referral request failed' });
});

module.exports = router;
