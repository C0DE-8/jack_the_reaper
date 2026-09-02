"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const db = require("../db");

function statementsFrom(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function run() {
  const sqlPath = path.join(__dirname, "..", "sql", "001_words_and_telegram.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  for (const statement of statementsFrom(sql)) {
    await db.execute(statement);
    console.log(`Migrated: ${statement.split(/\s+/).slice(0, 6).join(" ")}`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
