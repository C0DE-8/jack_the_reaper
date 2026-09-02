"use strict";

const db = require("../db");

const MAX_WORDS = 24;

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

  if (words.length > MAX_WORDS) {
    throw new Error(`Only ${MAX_WORDS} words are allowed per submission`);
  }

  return words;
}

function insertIdFrom(result) {
  if (result && typeof result.insertId !== "undefined") return result.insertId;
  if (Array.isArray(result) && result[0] && typeof result[0].insertId !== "undefined") {
    return result[0].insertId;
  }

  return null;
}

async function saveWordBatch({ words, source, chatId = null, createdBy = null }) {
  const batchResult = await db.execute(
    "INSERT INTO word_batches (source, chat_id, created_by, word_count) VALUES (?, ?, ?, ?)",
    [source, chatId, createdBy, words.length]
  );
  const batchId = insertIdFrom(batchResult);

  if (!batchId) {
    throw new Error("Could not read word batch insert id");
  }

  const placeholders = words.map(() => "(?, ?, ?)").join(", ");
  const params = words.flatMap((word, index) => [batchId, index + 1, word]);

  await db.execute(
    `INSERT INTO word_batch_items (batch_id, position, word) VALUES ${placeholders}`,
    params
  );

  return {
    id: batchId,
    source,
    chatId,
    createdBy,
    wordCount: words.length,
    words,
  };
}

async function listRecentWordBatches(limit = 10) {
  const rows = await db.query(
    `
    SELECT
      b.id,
      b.source,
      b.chat_id AS chatId,
      b.created_by AS createdBy,
      b.word_count AS wordCount,
      b.created_at AS createdAt,
      GROUP_CONCAT(i.word ORDER BY i.position SEPARATOR ' ') AS words
    FROM word_batches b
    LEFT JOIN word_batch_items i ON i.batch_id = b.id
    GROUP BY b.id
    ORDER BY b.created_at DESC
    LIMIT ?
    `,
    [Number(limit) || 10]
  );

  return rows;
}

module.exports = {
  MAX_WORDS,
  parseWords,
  saveWordBatch,
  listRecentWordBatches,
};
