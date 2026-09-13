"use strict";

const express = require("express");
const db = require("../db");
const { verifyAdminRequest } = require("../services/admin");

// Handles admin alert management and delivery of active alerts to user dashboards.
const router = express.Router();
const severities = new Set(["info", "success", "warning", "error"]);

function present(row) {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    severity: row.severity,
    targetAccountNumber: row.targetAccountNumber || null,
    active: Boolean(row.active),
    expiresAt: row.expiresAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function requireAdmin(req, res) {
  const admin = await verifyAdminRequest(req);
  if (!admin) res.status(401).json({ ok: false, error: "Invalid admin credentials" });
  return admin;
}

router.get("/", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const rows = await db.query(`
      SELECT id, title, message, severity, target_account_number AS targetAccountNumber,
        active, expires_at AS expiresAt, created_by AS createdBy,
        created_at AS createdAt, updated_at AS updatedAt
      FROM user_alerts ORDER BY created_at DESC LIMIT 100
    `);
    res.json({ ok: true, alerts: rows.map(present) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/", async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const title = String(req.body?.title || "").trim();
    const message = String(req.body?.message || "").trim();
    const severity = String(req.body?.severity || "info");
    const target = String(req.body?.targetAccountNumber || "").trim() || null;
    const expiresAt = req.body?.expiresAt || null;
    if (!title || title.length > 120) throw new Error("Title is required and must be 120 characters or fewer");
    if (!message || message.length > 5000) throw new Error("Message is required and must be 5,000 characters or fewer");
    if (!severities.has(severity)) throw new Error("Invalid alert severity");
    if (target) {
      const account = await db.query("SELECT id FROM word_accounts WHERE account_number = ? LIMIT 1", [target]);
      if (!account.length) return res.status(404).json({ ok: false, error: "Target account was not found" });
    }
    if (expiresAt && Number.isNaN(Date.parse(expiresAt))) throw new Error("Expiration date is invalid");
    const result = await db.execute(`
      INSERT INTO user_alerts (title, message, severity, target_account_number, expires_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [title, message, severity, target, expiresAt ? new Date(expiresAt) : null, admin.email]);
    const [row] = await db.query(`
      SELECT id, title, message, severity, target_account_number AS targetAccountNumber,
        active, expires_at AS expiresAt, created_by AS createdBy,
        created_at AS createdAt, updated_at AS updatedAt FROM user_alerts WHERE id = ?
    `, [result.insertId]);
    res.status(201).json({ ok: true, alert: present(row) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.patch("/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    if (typeof req.body?.active !== "boolean") throw new Error("active must be true or false");
    const result = await db.execute("UPDATE user_alerts SET active = ? WHERE id = ?", [req.body.active ? 1 : 0, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ ok: false, error: "Alert was not found" });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.get("/user/:accountNumber", async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT id, title, message, severity, created_at AS createdAt, expires_at AS expiresAt
      FROM user_alerts
      WHERE active = 1
        AND (target_account_number IS NULL OR target_account_number = ?)
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at ASC LIMIT 20
    `, [req.params.accountNumber]);
    res.json({ ok: true, alerts: rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
