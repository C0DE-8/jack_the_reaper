"use strict";

const express = require("express");
const db = require("../db");

const router = express.Router();
const authorizedChats = new Set();

function botToken() {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function adminPassword() {
  return process.env.ADMIN_PASSWORD;
}

function isWebhookSecretValid(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;

  return req.get("x-telegram-bot-api-secret-token") === expected;
}

function isSetupSecretValid(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;

  return req.get("x-setup-secret") === expected;
}

function getMessage(update) {
  return update.message || update.edited_message || update.channel_post || null;
}

function getChatId(message) {
  return message?.chat?.id ? String(message.chat.id) : null;
}

function getText(message) {
  return typeof message?.text === "string" ? message.text.trim() : "";
}

function isAuthorized(chatId) {
  return chatId && authorizedChats.has(String(chatId));
}

async function telegramApi(method, payload) {
  const token = botToken();
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(result.description || `Telegram API failed with ${response.status}`);
  }

  return result.result;
}

async function sendMessage(chatId, text, extra = {}) {
  if (process.env.TELEGRAM_DRY_RUN === "true") {
    console.log("Telegram dry run:", JSON.stringify({ chatId, text, extra }));
    return { dryRun: true };
  }

  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...extra,
  });
}

function loginPasswordFrom(text) {
  if (text.startsWith("/login")) {
    return text.replace(/^\/login(@\w+)?\s*/i, "").trim();
  }

  return text;
}

async function reply(chatId, text, extra = {}) {
  return sendMessage(chatId, text, extra);
}

async function askForPassword(chatId) {
  await reply(chatId, "Enter admin password.", {
    reply_markup: {
      force_reply: true,
      input_field_placeholder: "Admin password",
    },
  });
}

async function handleAdminCommand(chatId, text, message) {
  if (text === "/help" || text === "/help@word_bot") {
    await reply(
      chatId,
      [
        "Admin commands:",
        "/health - check DBMS Gateway status",
        "/db_ping - run SELECT 1 through DBMS Gateway",
        "/whoami - show this Telegram chat id",
        "/logout - lock this chat",
      ].join("\n")
    );
    return;
  }

  if (text === "/whoami" || text === "/whoami@word_bot") {
    await reply(chatId, `chat_id: ${chatId}\nuser_id: ${message.from?.id || "unknown"}`);
    return;
  }

  if (text === "/health" || text === "/health@word_bot") {
    const status = await db.status();
    await reply(chatId, `Gateway status:\n${JSON.stringify(status, null, 2)}`);
    return;
  }

  if (text === "/db_ping" || text === "/db_ping@word_bot") {
    const rows = await db.query("SELECT 1 AS ok");
    await reply(chatId, `DB ping:\n${JSON.stringify(rows, null, 2)}`);
    return;
  }

  if (text === "/logout" || text === "/logout@word_bot") {
    authorizedChats.delete(chatId);
    await reply(chatId, "Logged out. Send /start to unlock admin access again.");
    return;
  }

  await reply(chatId, "Unknown admin command. Send /help.");
}

async function handleMessage(message) {
  const chatId = getChatId(message);
  const text = getText(message);

  if (!chatId || !text) return;

  if (text === "/start" || text === "/start@word_bot") {
    authorizedChats.delete(chatId);
    await askForPassword(chatId);
    return;
  }

  const configuredPassword = adminPassword();
  if (!configuredPassword) {
    await reply(chatId, "ADMIN_PASSWORD is not configured on the server.");
    return;
  }

  if (!isAuthorized(chatId)) {
    if (loginPasswordFrom(text) === configuredPassword) {
      authorizedChats.add(chatId);
      await reply(chatId, "Admin access granted. Send /help.");
      return;
    }

    await askForPassword(chatId);
    return;
  }

  await handleAdminCommand(chatId, text, message);
}

router.post("/webhook", async (req, res) => {
  if (!isWebhookSecretValid(req)) {
    return res.status(401).json({ ok: false, error: "Invalid Telegram webhook secret" });
  }

  res.json({ ok: true });

  const message = getMessage(req.body);
  if (!message) return;

  try {
    await handleMessage(message);
  } catch (error) {
    console.error("Telegram webhook handler failed:", error);
  }
});

router.get("/status", (req, res) => {
  res.json({
    ok: true,
    configured: {
      botToken: Boolean(botToken()),
      adminPassword: Boolean(adminPassword()),
      webhookSecret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      activeAdminSessions: authorizedChats.size,
    },
  });
});

router.post("/set-webhook", async (req, res) => {
  if (!isSetupSecretValid(req)) {
    return res.status(401).json({ ok: false, error: "Invalid setup secret" });
  }

  try {
    const baseUrl = req.body?.baseUrl || process.env.PUBLIC_URL;
    if (!baseUrl) {
      return res.status(400).json({ ok: false, error: "PUBLIC_URL or body.baseUrl is required" });
    }

    const url = `${String(baseUrl).replace(/\/+$/, "")}/telegram/webhook`;
    const result = await telegramApi("setWebhook", {
      url,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
    });

    res.json({ ok: true, webhookUrl: url, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
