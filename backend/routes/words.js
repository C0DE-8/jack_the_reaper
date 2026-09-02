"use strict";

const express = require("express");
const { sendTelegramAlert } = require("../telegram");
const { listRecentWordBatches, parseWords, saveWordBatch } = require("../services/words");

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
      source: "public",
      createdBy: req.body?.createdBy || "public",
    });

    const notification = [
      `New public word message #${batch.id}`,
      `${batch.wordCount} words`,
      batch.words.join(" "),
    ].join("\n");

    const sent = await sendTelegramAlert(notification);

    res.status(201).json({
      ok: true,
      batch,
      telegram: {
        sent,
        message: sent ? "Message sent to Telegram admins." : "No active Telegram admin chats are registered yet.",
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

module.exports = router;
