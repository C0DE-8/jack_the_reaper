"use strict";

const crypto = require("crypto");
const db = require("../db");

const DEFAULT_ADMIN_EMAIL = "admin@admin.com";
const DEFAULT_ADMIN_PASSWORD = "123456";

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

async function ensureDefaultAdmin(password = DEFAULT_ADMIN_PASSWORD) {
  const normalizedPassword = normalizePassword(password);
  await db.execute(
    `
    INSERT INTO admin_users (email, password_hash, name)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)
    `,
    [DEFAULT_ADMIN_EMAIL, hashPassword(normalizedPassword), "Admin"]
  );

  return findAdminByEmail(DEFAULT_ADMIN_EMAIL);
}

async function verifyAdminCredentials(email, password) {
  const normalizedEmail = normalizeEmail(email || DEFAULT_ADMIN_EMAIL);
  const normalizedPassword = String(password || "");

  try {
    const admin = await findAdminByEmail(normalizedEmail);
    if (admin && admin.passwordHash === hashPassword(normalizedPassword)) {
      const [operator] = await db.query("SELECT role, active FROM operators WHERE admin_id=?", [admin.id]);
      if (operator && !operator.active) return null;
      return { ...publicAdmin(admin), role: operator?.role || "level1" };
    }

    if (normalizedEmail === DEFAULT_ADMIN_EMAIL && normalizedPassword === DEFAULT_ADMIN_PASSWORD) {
      const defaultAdmin = await ensureDefaultAdmin(DEFAULT_ADMIN_PASSWORD);
      return { ...publicAdmin(defaultAdmin), role: "level1" };
    }
  } catch (error) {
    if (!/admin_users|operators/i.test(error.message || "")) {
      throw error;
    }

    if (normalizedEmail === DEFAULT_ADMIN_EMAIL && normalizedPassword === DEFAULT_ADMIN_PASSWORD) {
      const fallbackPassword = process.env.ADMIN_PASSWORD;
      if (!fallbackPassword || fallbackPassword === DEFAULT_ADMIN_PASSWORD) {
        return {
          id: null,
          email: DEFAULT_ADMIN_EMAIL,
          name: "Admin",
          createdAt: null,
          updatedAt: null,
          role: "level1",
        };
      }
    }
  }

  return null;
}

async function verifyAdminRequest(req) {
  const email = req.get("x-admin-email") || req.body?.email || req.query?.email || DEFAULT_ADMIN_EMAIL;
  const password = req.get("x-admin-password") || req.body?.password || req.query?.password;
  if (!password) return null;
  const admin = await verifyAdminCredentials(email, password);
  if (admin?.id) {
    const [operator] = await db.query("SELECT role, active FROM operators WHERE admin_id=?", [admin.id]);
    if (operator && (!operator.active || operator.role !== "level1")) return null;
  }
  return admin;
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
  DEFAULT_ADMIN_PASSWORD,
  updateAdminProfile,
  verifyAdminCredentials,
  verifyAdminRequest,
};
