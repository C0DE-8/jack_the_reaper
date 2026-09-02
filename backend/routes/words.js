"use strict";

const express = require("express");
const { approvalKeyboard, sendTelegramAlert } = require("../telegram");
const {
  approveWordBatch,
  getAccountByNumber,
  getWordBatch,
  listAccounts,
  listRecentWordBatches,
  parseWords,
  rejectWordBatch,
  saveWordBatch,
  topUpAccount,
} = require("../services/words");

const router = express.Router();

function isAdminRequest(req) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;

  return (
    req.get("x-admin-password") === password ||
    req.body?.password === password ||
    req.query?.password === password
  );
}

router.post("/", async (req, res) => {
  try {
    const words = parseWords(req.body?.words || req.body?.text);
    const batch = await saveWordBatch({
      words,
      title: req.body?.title,
      source: "public",
      createdBy: req.body?.createdBy || "public",
    });

    let sent = false;
    if (!batch.loggedIn) {
      const notification = [
        `New word message waiting for approval #${batch.id}`,
        batch.title ? `Title: ${batch.title}` : null,
        `${batch.wordCount} words`,
        batch.words.join(" "),
      ].filter(Boolean).join("\n");

      sent = await sendTelegramAlert(notification, {
        reply_markup: approvalKeyboard(batch.id),
      });
    }

    res.status(201).json({
      ok: true,
      batch,
      telegram: {
        sent,
        message: batch.loggedIn
          ? "Existing account found. User is logged in."
          : sent
            ? "Message sent to Telegram admins for approval."
            : "No active Telegram admin chats are registered yet.",
      },
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.get("/", async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({ ok: false, error: "Invalid admin password" });
  }

  try {
    const batches = await listRecentWordBatches(req.query.limit || 10);
    res.json({ ok: true, batches });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/accounts", async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({ ok: false, error: "Invalid admin password" });
  }

  try {
    res.json({ ok: true, accounts: await listAccounts(req.query.limit || 10) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/accounts/:accountNumber", async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({ ok: false, error: "Invalid admin password" });
  }

  try {
    const account = await getAccountByNumber(req.params.accountNumber);
    if (!account) return res.status(404).json({ ok: false, error: "Account was not found" });
    return res.json({ ok: true, account });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/accounts/:accountNumber/top-up", async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({ ok: false, error: "Invalid admin password" });
  }

  try {
    const account = await topUpAccount(req.params.accountNumber, req.body?.asset, req.body?.amount);
    res.json({ ok: true, account });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.get("/:id/status", async (req, res) => {
  try {
    const batch = await getWordBatch(req.params.id);
    if (!batch) {
      return res.status(404).json({ ok: false, error: "Word batch was not found" });
    }

    res.json({
      ok: true,
      batch: {
        id: batch.id,
        title: batch.title,
        wordCount: batch.wordCount,
        approvalStatus: batch.approvalStatus,
        reviewedAt: batch.reviewedAt,
        account: batch.account,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/:id/approve", async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({ ok: false, error: "Invalid admin password" });
  }

  try {
    const batch = await approveWordBatch(req.params.id, { name: req.body?.reviewedBy || "api" });
    res.json({ ok: true, batch });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.post("/:id/reject", async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({ ok: false, error: "Invalid admin password" });
  }

  try {
    const batch = await rejectWordBatch(req.params.id, { name: req.body?.reviewedBy || "api" });
    res.json({ ok: true, batch });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

module.exports = router;
