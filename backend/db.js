"use strict";

require("dotenv").config();

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "word",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  decimalNumbers: true,
});

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

async function getConnection() {
  const connection = await pool.getConnection();

  return {
    async query(sql, params = []) {
      const [rows] = await connection.query(sql, params);
      return rows;
    },
    async execute(sql, params = []) {
      const [result] = await connection.execute(sql, params);
      return result;
    },
    beginTransaction: () => connection.beginTransaction(),
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
    release: () => connection.release(),
  };
}

module.exports = {
  query,
  execute,
  getConnection,
  async status() {
    const rows = await query("SELECT DATABASE() AS databaseName, VERSION() AS version");
    return { connected: true, ...rows[0] };
  },
  end: () => pool.end(),
};
