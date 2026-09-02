"use strict";

const db = require("./db");

const configuredWebhookUrl = process.env.TELEGRAM_WEBHOOK_URL || "";
const menuKeyboard = {
  keyboard: [
    [{ text: "Activate Alerts" }, { text: "Alert Status" }],
    [{ text: "Stop Alerts" }],
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
};

function botToken() {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function alertPasscode() {
  return process.env.ADMIN_PASSWORD || process.env.TELEGRAM_ALERT_PASSCODE || "";
}

function webhookSecret() {
  return process.env.TELEGRAM_WEBHOOK_SECRET || "";
}

function canUseTelegram() {
  return Boolean(botToken());
}

function telegramApiBase() {
  return canUseTelegram() ? `https://api.telegram.org/bot${botToken()}` : "";
}

async function telegramRequest(method, body = {}) {
  if (!canUseTelegram()) {
    return null;
  }

  const response = await fetch(`${telegramApiBase()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.description || `Telegram ${method} failed`);
    error.status = response.status;
    throw error;
  }

  return data.result;
}

async function sendTelegramMessage(chatId, text, options = {}) {
  if (process.env.TELEGRAM_DRY_RUN === "true") {
    console.log("Telegram dry run:", JSON.stringify({ chatId, text, options }));
    return { dryRun: true };
  }

  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...options,
  });
}

function isAbsoluteUrl(value) {
  return /^https:\/\//i.test(String(value || ""));
}

function publicUrlFrom(value) {
  return String(value || process.env.PUBLIC_URL || process.env.TELEGRAM_PUBLIC_URL || process.env.SITE_URL || "")
    .replace(/\/+$/, "");
}

function buildWebhookUrl(value) {
  if (isAbsoluteUrl(value) && /\/webhook\//.test(value)) {
    return value;
  }

  if (configuredWebhookUrl) {
    return configuredWebhookUrl;
  }

  const siteUrl = publicUrlFrom(value);
  const secret = webhookSecret();
  if (!siteUrl || !secret) {
    return "";
  }

  return `${siteUrl}/api/telegram/webhook/${encodeURIComponent(secret)}`;
}

async function setTelegramWebhook(value) {
  const url = buildWebhookUrl(value);
  if (!url) {
    throw new Error("PUBLIC_URL plus TELEGRAM_WEBHOOK_SECRET is required");
  }

  return telegramRequest("setWebhook", {
    url,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
}

function verifyTelegramPasscode(passcode) {
  return String(passcode || "").trim() === alertPasscode();
}

async function upsertTelegramAlertChat(chat) {
  await db.execute(
    `
    INSERT INTO telegram_admin_chats
      (chat_id, telegram_user_id, username, first_name, last_name, authorized, last_login_at)
    VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE
      telegram_user_id = VALUES(telegram_user_id),
      username = VALUES(username),
      first_name = VALUES(first_name),
      last_name = VALUES(last_name),
      authorized = 1,
      last_login_at = CURRENT_TIMESTAMP
    `,
    [
      String(chat.id),
      chat.id ? String(chat.id) : null,
      chat.username || null,
      chat.first_name || null,
      chat.last_name || null,
    ]
  );
}

async function getActiveTelegramAlertChats() {
  return db.query("SELECT chat_id FROM telegram_admin_chats WHERE authorized = 1 ORDER BY last_login_at ASC");
}

async function countActiveTelegramAlertChats() {
  const rows = await db.query("SELECT COUNT(*) AS count FROM telegram_admin_chats WHERE authorized = 1");
  return Number(rows[0]?.count || 0);
}

async function disableTelegramAlertChat(chatId) {
  await db.execute("UPDATE telegram_admin_chats SET authorized = 0 WHERE chat_id = ?", [String(chatId)]);
}

async function isTelegramAlertChatActive(chatId) {
  const rows = await db.query("SELECT chat_id FROM telegram_admin_chats WHERE chat_id = ? AND authorized = 1", [
    String(chatId),
  ]);
  return rows.length > 0;
}

function chunksForTelegram(text) {
  const value = String(text || "");
  const chunks = [];
  for (let index = 0; index < value.length; index += 3900) {
    chunks.push(value.slice(index, index + 3900));
  }
  return chunks.length ? chunks : [""];
}

async function sendTelegramAlert(text) {
  if (!canUseTelegram()) {
    console.warn("Telegram bot token is not configured; alert skipped.");
    return false;
  }

  const chats = await getActiveTelegramAlertChats();
  if (!chats.length) {
    console.warn("No Telegram alert chats are registered; alert skipped.");
    return false;
  }

  await Promise.all(
    chats.map(async (chat) => {
      const chatId = chat.chat_id || chat.chatId;
      try {
        for (const chunk of chunksForTelegram(text)) {
          await sendTelegramMessage(chatId, chunk);
        }
      } catch (error) {
        if (error.status === 403 || error.status === 400) {
          await disableTelegramAlertChat(chatId);
        }
        console.error("Telegram alert delivery failed.");
        console.error(error.message);
      }
    })
  );

  return true;
}

async function getTelegramWebhookInfo() {
  return telegramRequest("getWebhookInfo", {});
}

async function deleteTelegramWebhook(dropPendingUpdates = false) {
  return telegramRequest("deleteWebhook", {
    drop_pending_updates: Boolean(dropPendingUpdates),
  });
}

async function getTelegramStatus(value) {
  const webhookInfo = canUseTelegram() ? await getTelegramWebhookInfo() : null;

  return {
    configured: canUseTelegram(),
    expectedWebhookUrl: buildWebhookUrl(value),
    webhookSecretConfigured: Boolean(webhookSecret()),
    activeChatCount: await countActiveTelegramAlertChats(),
    webhookInfo,
  };
}

async function handleTelegramMessage(message) {
  const text = String(message.text || "").trim();
  const chat = message.chat;
  if (!chat || !text) return;

  if (text === "/start") {
    await sendTelegramMessage(chat.id, "Choose an alert option. Use Activate Alerts, then send the admin password.", {
      reply_markup: menuKeyboard,
    });
    return;
  }

  if (text === "Activate Alerts") {
    await sendTelegramMessage(chat.id, "Send the admin password to activate this chat.", {
      reply_markup: menuKeyboard,
    });
    return;
  }

  if (text === "Alert Status") {
    const isActive = await isTelegramAlertChatActive(chat.id);
    await sendTelegramMessage(
      chat.id,
      isActive ? "Alerts are active for this chat." : "Alerts are not active. Tap Activate Alerts and send the password.",
      { reply_markup: menuKeyboard }
    );
    return;
  }

  if (text === "/stop" || text === "Stop Alerts") {
    await disableTelegramAlertChat(chat.id);
    await sendTelegramMessage(chat.id, "Telegram alerts have been turned off for this chat.", {
      reply_markup: menuKeyboard,
    });
    return;
  }

  if (verifyTelegramPasscode(text) || verifyTelegramPasscode(text.replace(/^\/login(@\w+)?\s*/i, ""))) {
    await upsertTelegramAlertChat(chat);
    await sendTelegramMessage(chat.id, "Telegram alerts are active for Jack The Reaper.", {
      reply_markup: menuKeyboard,
    });
    return;
  }

  await sendTelegramMessage(chat.id, "Use the buttons below to manage alerts.", {
    reply_markup: menuKeyboard,
  });
}

async function handleTelegramUpdate(update) {
  if (update && update.message) {
    await handleTelegramMessage(update.message);
  }
}

module.exports = {
  buildWebhookUrl,
  canUseTelegram,
  deleteTelegramWebhook,
  getTelegramStatus,
  getTelegramWebhookInfo,
  handleTelegramUpdate,
  sendTelegramAlert,
  sendTelegramMessage,
  setTelegramWebhook,
  verifyTelegramPasscode,
  webhookSecret,
};
