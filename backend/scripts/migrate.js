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
  const sqlDir = path.join(__dirname, "..", "sql");
  const files = fs.readdirSync(sqlDir).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(sqlDir, file), "utf8");
    for (const statement of statementsFrom(sql)) {
      try {
        await db.execute(statement);
        console.log(`Migrated ${file}: ${statement.split(/\s+/).slice(0, 6).join(" ")}`);
      } catch (error) {
        if (/duplicate column|duplicate key|duplicate.*index/i.test(error.message || "")) {
          console.log(`Skipped ${file}: ${statement.split(/\s+/).slice(0, 6).join(" ")} already applied`);
          continue;
        }

        throw error;
      }
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
