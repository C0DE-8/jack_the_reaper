"use strict";

const crypto = require("crypto");

const DEFAULT_SESSION_TTL_SECONDS = 24 * 60 * 60;

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function sessionSecret() {
  const secret = process.env.CLIENT_SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error("CLIENT_SESSION_SECRET is required to issue client sessions");
  }
  return secret;
}

function generateSessionToken(batch) {
  if (!batch?.account?.id || !batch.account.accountNumber) {
    throw new Error("An approved account is required to issue a client session");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    sub: String(batch.account.id),
    accountNumber: batch.account.accountNumber,
    batchId: batch.account.batchId || batch.id,
    iat: now,
    exp: now + DEFAULT_SESSION_TTL_SECONDS,
  }));
  const unsignedToken = `${header}.${payload}`;
  const signature = crypto
    .createHmac("sha256", sessionSecret())
    .update(unsignedToken)
    .digest("base64url");

  return `${unsignedToken}.${signature}`;
}

module.exports = { generateSessionToken };
