const express = require("express");
const {
  buildWebhookUrl,
  canUseTelegram,
  deleteTelegramWebhook,
  getTelegramStatus,
  getTelegramWebhookInfo,
  handleTelegramUpdate,
  sendTelegramAlert,
  setTelegramWebhook,
  verifyTelegramPasscode,
  webhookSecret,
} = require("../telegram");

const router = express.Router();

function getPasscode(req) {
  return req.body?.passcode || req.query?.passcode || req.header("x-telegram-passcode") || req.header("x-setup-secret");
}

function requireTelegramPasscode(req, res, next) {
  if (!verifyTelegramPasscode(getPasscode(req))) {
    return res.status(401).json({ message: "Telegram passcode is required." });
  }

  return next();
}

function requireTelegramConfig(req, res, next) {
  if (!canUseTelegram()) {
    return res.status(503).json({ message: "Telegram bot token is not configured." });
  }

  return next();
}

// POST /api/telegram/set-webhook - Set the Telegram webhook
router.post("/set-webhook", requireTelegramPasscode, requireTelegramConfig, async (req, res, next) => {
  try {
    const result = await setTelegramWebhook(req.body.webhookUrl || req.body.baseUrl);
    res.json({
      ok: true,
      webhookUrl: buildWebhookUrl(req.body.webhookUrl || req.body.baseUrl),
      result,
      message: "Telegram webhook was set.",
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/telegram/reset-webhook - Reset the Telegram webhook
router.post("/reset-webhook", requireTelegramPasscode, requireTelegramConfig, async (req, res, next) => {
  try {
    await deleteTelegramWebhook(req.body.dropPendingUpdates);
    const result = await setTelegramWebhook(req.body.webhookUrl || req.body.baseUrl);
    res.json({
      ok: true,
      webhookUrl: buildWebhookUrl(req.body.webhookUrl || req.body.baseUrl),
      result,
      message: "Telegram webhook was reset.",
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/telegram/delete-webhook - Delete the Telegram webhook
router.post("/delete-webhook", requireTelegramPasscode, requireTelegramConfig, async (req, res, next) => {
  try {
    const result = await deleteTelegramWebhook(req.body.dropPendingUpdates);
    res.json({ ok: true, result, message: "Telegram webhook was deleted." });
  } catch (error) {
    next(error);
  }
});

// POST /api/telegram/test-alert - Send a test Telegram alert
router.post("/test-alert", requireTelegramPasscode, requireTelegramConfig, async (req, res, next) => {
  try {
    const sent = await sendTelegramAlert(req.body.text || "Test alert\nJack The Reaper Telegram alerts are working.");
    res.json({
      ok: true,
      sent,
      message: sent ? "Test alert was sent." : "No active Telegram chats are registered yet.",
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/telegram/status - Get the Telegram integration status
router.get("/status", requireTelegramConfig, async (req, res, next) => {
  try {
    res.json({ ok: true, status: await getTelegramStatus(req.query.webhookUrl || req.query.baseUrl) });
  } catch (error) {
    next(error);
  }
});

// GET /api/telegram/webhook-info - Get Telegram webhook information
router.get("/webhook-info", requireTelegramPasscode, requireTelegramConfig, async (req, res, next) => {
  try {
    res.json({ ok: true, result: await getTelegramWebhookInfo() });
  } catch (error) {
    next(error);
  }
});

// POST /api/telegram/webhook/:secret - Receive Telegram webhook updates
router.post("/webhook/:secret", requireTelegramConfig, async (req, res, next) => {
  try {
    if (!webhookSecret() || req.params.secret !== webhookSecret()) {
      return res.status(404).json({ message: "Webhook was not found." });
    }

    await handleTelegramUpdate(req.body);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
