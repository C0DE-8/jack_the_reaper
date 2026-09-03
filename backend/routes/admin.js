"use strict";

const express = require("express");
const {
  updateAdminProfile,
  verifyAdminCredentials,
  verifyAdminRequest,
} = require("../services/admin");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const admin = await verifyAdminCredentials(req.body?.email, req.body?.password);
    if (!admin) {
      return res.status(401).json({ ok: false, error: "Invalid admin email or password" });
    }

    return res.json({ ok: true, admin });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }
});

router.get("/profile", async (req, res) => {
  try {
    const admin = await verifyAdminRequest(req);
    if (!admin) {
      return res.status(401).json({ ok: false, error: "Invalid admin credentials" });
    }

    return res.json({ ok: true, admin });
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, error: error.message });
  }
});

router.put("/profile", async (req, res) => {
  try {
    const admin = await updateAdminProfile(req.body?.currentEmail, req.body?.currentPassword, {
      email: req.body?.email,
      name: req.body?.name,
      newPassword: req.body?.newPassword,
    });

    return res.json({ ok: true, admin });
  } catch (error) {
    return res.status(error.status || 400).json({ ok: false, error: error.message });
  }
});

module.exports = router;
