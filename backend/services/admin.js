"use strict";

const crypto = require("crypto");
const db = require("../db");

const DEFAULT_ADMIN_EMAIL = "admin@admin.com";

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password || "")).digest("hex");
}

function normalizeEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error("A valid email is required");
  }
  return value;
}

function normalizePassword(password, label = "Password") {
  const value = String(password || "");
  if (value.length < 6) {
    throw new Error(`${label} must be at least 6 characters`);
  }
  return value;
}

function publicAdmin(admin) {
  if (!admin) return null;
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name || "Admin",
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}

async function findAdminByEmail(email) {
  const rows = await db.query(
    `
    SELECT
      id,
      email,
      password_hash AS passwordHash,
      name,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM admin_users
    WHERE email = ?
    LIMIT 1
    `,
    [normalizeEmail(email)]
  );

  return rows[0] || null;
}

async function verifyAdminCredentials(email, password) {
  const normalizedEmail = normalizeEmail(email || DEFAULT_ADMIN_EMAIL);
  const normalizedPassword = String(password || "");

  try {
    const admin = await findAdminByEmail(normalizedEmail);
    if (admin && admin.passwordHash === hashPassword(normalizedPassword)) {
      return publicAdmin(admin);
    }
  } catch (error) {
    if (!/admin_users/i.test(error.message || "")) {
      throw error;
    }
  }

  const fallbackPassword = process.env.ADMIN_PASSWORD;
  if (normalizedEmail === DEFAULT_ADMIN_EMAIL && fallbackPassword && normalizedPassword === fallbackPassword) {
    return {
      id: null,
      email: DEFAULT_ADMIN_EMAIL,
      name: "Admin",
      createdAt: null,
      updatedAt: null,
    };
  }

  return null;
}

async function verifyAdminRequest(req) {
  const email = req.get("x-admin-email") || req.body?.email || req.query?.email || DEFAULT_ADMIN_EMAIL;
  const password = req.get("x-admin-password") || req.body?.password || req.query?.password;
  if (!password) return null;
  return verifyAdminCredentials(email, password);
}

async function updateAdminProfile(currentEmail, currentPassword, updates = {}) {
  const admin = await verifyAdminCredentials(currentEmail, currentPassword);
  if (!admin) {
    const error = new Error("Invalid admin credentials");
    error.status = 401;
    throw error;
  }

  const nextEmail = updates.email ? normalizeEmail(updates.email) : admin.email;
  const nextName = String(updates.name || admin.name || "Admin").trim() || "Admin";
  const nextPassword = updates.newPassword
    ? normalizePassword(updates.newPassword, "New password")
    : currentPassword;

  if (!admin.id) {
    await db.execute(
      "INSERT INTO admin_users (email, password_hash, name) VALUES (?, ?, ?)",
      [nextEmail, hashPassword(nextPassword), nextName]
    );
    return publicAdmin(await findAdminByEmail(nextEmail));
  }

  await db.execute(
    "UPDATE admin_users SET email = ?, password_hash = ?, name = ? WHERE id = ?",
    [nextEmail, hashPassword(nextPassword), nextName, admin.id]
  );

  return publicAdmin(await findAdminByEmail(nextEmail));
}

module.exports = {
  DEFAULT_ADMIN_EMAIL,
  updateAdminProfile,
  verifyAdminCredentials,
  verifyAdminRequest,
};
