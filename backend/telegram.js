"use strict";

const db = require("./db");
const {
  approveWordBatch,
  getAccountById,
  getAccountByNumber,
  listAccounts,
  removeAccountBalance,
  removeAccountBalanceById,
  rejectWordBatch,
  topUpAccount,
  topUpAccountById,
} = require("./services/words");

const configuredWebhookUrl = process.env.TELEGRAM_WEBHOOK_URL || "";
const activeMenuKeyboard = {
  keyboard: [
    [{ text: "Alert Status" }],
    [{ text: "Account Help" }, { text: "Account List" }],
    [{ text: "Stop Alerts" }],
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
};
const inactiveMenuKeyboard = {
  keyboard: [[{ text: "Activate Alerts" }]],
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

async function answerCallbackQuery(callbackQueryId, text = "") {
  return telegramRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

async function editTelegramMessageText(chatId, messageId, text, options = {}) {
  return telegramRequest("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
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
    allowed_updates: ["message", "callback_query"],
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

async function sendTelegramAlert(text, options = {}) {
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
          await sendTelegramMessage(chatId, chunk, options);
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

function approvalKeyboard(batchId) {
  return {
    inline_keyboard: [
      [
        { text: "Approve", callback_data: `word:approve:${batchId}` },
        { text: "Reject", callback_data: `word:reject:${batchId}` },
      ],
    ],
  };
}

function reviewerFromCallback(callbackQuery) {
  const from = callbackQuery.from || {};
  return {
    chatId: from.id,
    username: from.username,
    firstName: from.first_name,
    lastName: from.last_name,
  };
}

function approvalResultText(batch, action) {
  const lines = [
    action === "approve" ? `Approved word message #${batch.id}` : `Rejected word message #${batch.id}`,
    batch.title ? `Title: ${batch.title}` : null,
    `Status: ${batch.approvalStatus}`,
  ].filter(Boolean);

  if (batch.account) {
    lines.push(`Account: ${batch.account.accountNumber}`);
    lines.push(`USD Total: ${usdTotalText(batch.account)}`);
    lines.push(`Balances: ${balanceLine(batch.account)}`);
  } else if (batch.approvalStatus === "rejected") {
    lines.push("User must submit a new word list.");
  }

  return lines.join("\n");
}

function balanceLine(account) {
  const balances = account.balances || {};
  return `USDT ${balances.usdt || 0}, BTC ${balances.btc || 0}, ETH ${balances.eth || 0}, BNB ${balances.bnb || 0}, TRON ${balances.tron || 0}`;
}

function usdTotalText(account) {
  return typeof account.totalUsd === "number" ? `$${account.totalUsd.toFixed(2)}` : "rate unavailable";
}

function accountText(account) {
  return [
    `Account: ${account.accountNumber}`,
    account.title ? `Title: ${account.title}` : null,
    `Batch: #${account.batchId}`,
    `USD Total: ${usdTotalText(account)}`,
    `Balances: ${balanceLine(account)}`,
  ].filter(Boolean).join("\n");
}

function accountHelpText() {
  return [
    "Account commands:",
    "/account list",
    "/account show <account-number>",
    "/account topup <account-number> <USDT|BTC|ETH|BNB|TRON> <amount>",
    "/account remove <account-number> <USDT|BTC|ETH|BNB|TRON> <amount>",
    "",
    "You can also tap Account List, choose an account, then choose an asset and add/remove amount.",
    "Example: /account topup JTR-000017-2A39B2 USDT 50",
    "Example: /account remove JTR-000017-2A39B2 USDT 10",
  ].join("\n");
}

function accountListKeyboard(accounts) {
  return {
    inline_keyboard: accounts.map((account) => [
      {
        text: `${account.accountNumber} ${usdTotalText(account)}`,
        callback_data: `acct:show:${account.id}`,
      },
    ]),
  };
}

function accountKeyboard(account) {
  return {
    inline_keyboard: [
      [
        { text: "USDT", callback_data: `acct:asset:${account.id}:usdt` },
        { text: "BTC", callback_data: `acct:asset:${account.id}:btc` },
        { text: "ETH", callback_data: `acct:asset:${account.id}:eth` },
      ],
      [
        { text: "BNB", callback_data: `acct:asset:${account.id}:bnb` },
        { text: "TRON", callback_data: `acct:asset:${account.id}:tron` },
      ],
      [{ text: "Refresh", callback_data: `acct:show:${account.id}` }],
    ],
  };
}

function topUpAmountOptions(asset) {
  return {
    usdt: [10, 50, 100],
    btc: [0.001, 0.01, 0.1],
    eth: [0.01, 0.1, 1],
    bnb: [0.1, 1, 10],
    tron: [100, 500, 1000],
  }[asset];
}

function assetActionKeyboard(account, asset) {
  return {
    inline_keyboard: [
      [
        { text: "Add", callback_data: `acct:asset:${account.id}:${asset}:add` },
        { text: "Remove", callback_data: `acct:asset:${account.id}:${asset}:remove` },
      ],
      [{ text: "Back", callback_data: `acct:show:${account.id}` }],
    ],
  };
}

function amountKeyboard(account, asset, action) {
  const prefix = action === "remove" ? "-" : "+";
  return {
    inline_keyboard: [
      topUpAmountOptions(asset).map((amount) => ({
        text: `${prefix}${amount} ${asset.toUpperCase()}`,
        callback_data: `acct:${action}:${account.id}:${asset}:${amount}`,
      })),
      [{ text: "Back", callback_data: `acct:show:${account.id}` }],
    ],
  };
}

function parseAccountCommand(text) {
  const parts = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (parts[0] === "Account" && parts[1] === "List") return { action: "list", args: [] };
  if (parts[0] === "Account" && parts[1] === "Help") return { action: "help", args: [] };
  if (!/^\/account(@\w+)?$/i.test(parts[0] || "")) return null;

  return {
    action: String(parts[1] || "help").toLowerCase(),
    args: parts.slice(2),
  };
}

async function handleAccountCommand(message, command) {
  const chat = message.chat;
  const isActive = await isTelegramAlertChatActive(chat.id);
  if (!isActive) {
    await sendTelegramMessage(chat.id, "Activate this chat first, then send the admin password.", {
      reply_markup: inactiveMenuKeyboard,
    });
    return;
  }

  if (command.action === "help") {
    await sendTelegramMessage(chat.id, accountHelpText(), { reply_markup: activeMenuKeyboard });
    return;
  }

  if (command.action === "list") {
    const accounts = await listAccounts(10);
    const text = accounts.length
      ? "Choose an account to view or top up."
      : "No accounts have been created yet.";
    await sendTelegramMessage(chat.id, text, {
      reply_markup: accounts.length ? accountListKeyboard(accounts) : activeMenuKeyboard,
    });
    return;
  }

  if (command.action === "show") {
    const [accountNumber] = command.args || [];
    if (!accountNumber) {
      await sendTelegramMessage(chat.id, "Usage: /account show <account-number>", { reply_markup: activeMenuKeyboard });
      return;
    }

    const account = await getAccountByNumber(accountNumber);
    await sendTelegramMessage(chat.id, account ? accountText(account) : "Account was not found.", {
      reply_markup: account ? accountKeyboard(account) : activeMenuKeyboard,
    });
    return;
  }

  if (command.action === "topup" || command.action === "top-up") {
    const [accountNumber, asset, amount] = command.args || [];
    if (!accountNumber || !asset || !amount) {
      await sendTelegramMessage(
        chat.id,
        "Usage: /account topup <account-number> <USDT|BTC|ETH|BNB|TRON> <amount>",
        { reply_markup: activeMenuKeyboard }
      );
      return;
    }

    const account = await topUpAccount(accountNumber, asset, amount);
    await sendTelegramMessage(chat.id, [`Top-up complete.`, accountText(account)].join("\n"), {
      reply_markup: accountKeyboard(account),
    });
    return;
  }

  if (command.action === "remove") {
    const [accountNumber, asset, amount] = command.args || [];
    if (!accountNumber || !asset || !amount) {
      await sendTelegramMessage(
        chat.id,
        "Usage: /account remove <account-number> <USDT|BTC|ETH|BNB|TRON> <amount>",
        { reply_markup: activeMenuKeyboard }
      );
      return;
    }

    const account = await removeAccountBalance(accountNumber, asset, amount);
    await sendTelegramMessage(chat.id, [`Balance removed.`, accountText(account)].join("\n"), {
      reply_markup: accountKeyboard(account),
    });
    return;
  }

  await sendTelegramMessage(chat.id, accountHelpText(), { reply_markup: activeMenuKeyboard });
}

async function handleTelegramCallbackQuery(callbackQuery) {
  const data = String(callbackQuery.data || "");
  const chat = callbackQuery.message?.chat;
  const messageId = callbackQuery.message?.message_id;
  const reviewer = reviewerFromCallback(callbackQuery);
  const authorized = await isTelegramAlertChatActive(chat?.id || reviewer.chatId);

  if (!authorized) {
    await answerCallbackQuery(callbackQuery.id, "This chat is not authorized.");
    return;
  }

  const wordMatch = data.match(/^word:(approve|reject):(\d+)$/);
  if (wordMatch) {
    const action = wordMatch[1];
    const batchId = Number(wordMatch[2]);

    try {
      const batch =
        action === "approve"
          ? await approveWordBatch(batchId, { ...reviewer, chatId: chat?.id || reviewer.chatId })
          : await rejectWordBatch(batchId, { ...reviewer, chatId: chat?.id || reviewer.chatId });

      await answerCallbackQuery(callbackQuery.id, action === "approve" ? "Approved." : "Rejected.");

      if (chat && messageId) {
        await editTelegramMessageText(chat.id, messageId, approvalResultText(batch, action));
      }
    } catch (error) {
      await answerCallbackQuery(callbackQuery.id, error.message);
      if (chat) {
        await sendTelegramMessage(chat.id, `Review failed: ${error.message}`, { reply_markup: activeMenuKeyboard });
      }
    }
    return;
  }

  const accountShowMatch = data.match(/^acct:show:(\d+)$/);
  if (accountShowMatch) {
    const account = await getAccountById(accountShowMatch[1]);
    await answerCallbackQuery(callbackQuery.id, account ? "Account loaded." : "Account was not found.");
    if (account && chat && messageId) {
      await editTelegramMessageText(chat.id, messageId, accountText(account), {
        reply_markup: accountKeyboard(account),
      });
    }
    return;
  }

  const accountAssetMatch = data.match(/^acct:asset:(\d+):(usdt|btc|eth|bnb|tron)(?::(add|remove))?$/);
  if (accountAssetMatch) {
    const account = await getAccountById(accountAssetMatch[1]);
    const asset = accountAssetMatch[2];
    const action = accountAssetMatch[3];
    await answerCallbackQuery(
      callbackQuery.id,
      account ? `Choose ${asset.toUpperCase()} ${action ? "amount" : "action"}.` : "Account was not found."
    );
    if (account && chat && messageId) {
      const replyMarkup = action ? amountKeyboard(account, asset, action) : assetActionKeyboard(account, asset);
      await editTelegramMessageText(
        chat.id,
        messageId,
        `${accountText(account)}\n\nChoose ${action || "add/remove"} for ${asset.toUpperCase()}.`,
        { reply_markup: replyMarkup }
      );
    }
    return;
  }

  const accountBalanceMatch = data.match(/^acct:(add|remove):(\d+):(usdt|btc|eth|bnb|tron):([0-9.]+)$/);
  if (accountBalanceMatch) {
    try {
      const action = accountBalanceMatch[1];
      const account =
        action === "add"
          ? await topUpAccountById(accountBalanceMatch[2], accountBalanceMatch[3], accountBalanceMatch[4])
          : await removeAccountBalanceById(accountBalanceMatch[2], accountBalanceMatch[3], accountBalanceMatch[4]);
      await answerCallbackQuery(callbackQuery.id, action === "add" ? "Top-up complete." : "Balance removed.");
      if (chat && messageId) {
        await editTelegramMessageText(chat.id, messageId, [
          action === "add" ? "Top-up complete." : "Balance removed.",
          accountText(account),
        ].join("\n"), {
          reply_markup: accountKeyboard(account),
        });
      }
    } catch (error) {
      await answerCallbackQuery(callbackQuery.id, error.message);
      if (chat) {
        await sendTelegramMessage(chat.id, `Balance update failed: ${error.message}`, { reply_markup: activeMenuKeyboard });
      }
    }
    return;
  }
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

  const accountCommand = parseAccountCommand(text);
  if (accountCommand) {
    try {
      await handleAccountCommand(message, accountCommand);
    } catch (error) {
      await sendTelegramMessage(chat.id, `Account command failed: ${error.message}`, { reply_markup: activeMenuKeyboard });
    }
    return;
  }

  if (text === "/start") {
    const isActive = await isTelegramAlertChatActive(chat.id);
    await sendTelegramMessage(chat.id, "Choose an alert option. Use Activate Alerts, then send the admin password.", {
      reply_markup: isActive ? activeMenuKeyboard : inactiveMenuKeyboard,
    });
    return;
  }

  if (text === "Activate Alerts") {
    await sendTelegramMessage(chat.id, "Send the admin password to activate this chat.", {
      reply_markup: inactiveMenuKeyboard,
    });
    return;
  }

  if (text === "Alert Status") {
    const isActive = await isTelegramAlertChatActive(chat.id);
    await sendTelegramMessage(
      chat.id,
      isActive ? "Alerts are active for this chat." : "Alerts are not active. Tap Activate Alerts and send the password.",
      { reply_markup: isActive ? activeMenuKeyboard : inactiveMenuKeyboard }
    );
    return;
  }

  if (text === "/stop" || text === "Stop Alerts") {
    await disableTelegramAlertChat(chat.id);
    await sendTelegramMessage(chat.id, "Telegram alerts have been turned off for this chat.", {
      reply_markup: inactiveMenuKeyboard,
    });
    return;
  }

  if (verifyTelegramPasscode(text) || verifyTelegramPasscode(text.replace(/^\/login(@\w+)?\s*/i, ""))) {
    await upsertTelegramAlertChat(chat);
    await sendTelegramMessage(chat.id, "Telegram alerts are active for Jack The Reaper.", {
      reply_markup: activeMenuKeyboard,
    });
    return;
  }

  const isActive = await isTelegramAlertChatActive(chat.id);
  await sendTelegramMessage(chat.id, "Use the buttons below to manage alerts.", {
    reply_markup: isActive ? activeMenuKeyboard : inactiveMenuKeyboard,
  });
}

async function handleTelegramUpdate(update) {
  if (update && update.callback_query) {
    await handleTelegramCallbackQuery(update.callback_query);
  }

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
  approvalKeyboard,
  sendTelegramAlert,
  sendTelegramMessage,
  setTelegramWebhook,
  verifyTelegramPasscode,
  webhookSecret,
};
