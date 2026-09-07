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

router.get('/', async (req, res) => {
  res.json({ referrals: await db.query('SELECT id,code,name,active,created_at FROM referral_links ORDER BY id DESC') });
});

router.post('/', async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!/^[\p{L}\p{N} _-]{1,80}$/u.test(name)) return res.status(400).json({ error: 'Use a short campaign name with letters, numbers, spaces or dashes' });
  const code = crypto.randomBytes(12).toString('hex');
  await db.execute('INSERT INTO referral_links (code,name) VALUES (?,?)', [code, name]);
  res.status(201).json({ code, path: `/?ref=${code}` });
});

router.put('/:id', async (req, res) => {
  if (typeof req.body.active !== 'boolean') return res.status(400).json({ error: 'Boolean active required' });
  await db.execute('UPDATE referral_links SET active=? WHERE id=?', [req.body.active, req.params.id]);
  res.json({ ok: true });
});

router.use((error, req, res, next) => {
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Referral request failed' });
});

module.exports = router;
