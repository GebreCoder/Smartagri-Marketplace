import { Router } from "express";
import bcrypt from "bcryptjs";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { normalizeText } from "../utils.js";

const router = Router();
router.use(requireAuth);

// ── Update profile fields ──────────────────────────────────────────
// PATCH /api/users/me
// body (all optional): { biography?, fullName?, phoneNumber?, location?, businessName?, readReceipts? }
router.patch(
  "/me",
  asyncHandler(async (req, res) => {
    const biography = normalizeText(req.body.biography);
    const fullName = normalizeText(req.body.fullName);
    const phoneNumber = normalizeText(req.body.phoneNumber);
    const location = normalizeText(req.body.location);
    const businessName = normalizeText(req.body.businessName);
    const readReceipts = req.body.readReceipts;

    const fields = [];
    const values = [];

    // biography may be cleared (null) when emptied — mirrors the original app.
    if (Object.prototype.hasOwnProperty.call(req.body, "biography")) {
      fields.push(`biography = $${fields.length + 1}`);
      values.push(biography || null);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "fullName")) {
      fields.push(`full_name = $${fields.length + 1}`);
      values.push(fullName);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "phoneNumber")) {
      fields.push(`phone_number = $${fields.length + 1}`);
      values.push(phoneNumber);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "location")) {
      fields.push(`location = $${fields.length + 1}`);
      values.push(location);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "businessName")) {
      fields.push(`business_name = $${fields.length + 1}`);
      values.push(businessName);
    }
    if (typeof readReceipts === "boolean") {
      fields.push(`read_receipts = $${fields.length + 1}`);
      values.push(readReceipts);
    }

    if (!fields.length) {
      return res.status(400).json({ message: "Nothing to update." });
    }

    values.push(req.user.id);
    const { rows } = await query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );

    return res.json({ user: rows[0] });
  })
);

// ── Change password ────────────────────────────────────────────────
// POST /api/users/me/password  body: { currentPassword, newPassword }
router.post(
  "/me/password",
  asyncHandler(async (req, res) => {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters." });
    }

    const { rows } = await query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query("UPDATE users SET password = $1 WHERE id = $2", [passwordHash, req.user.id]);
    // Invalidate any outstanding reset tokens for the account.
    await query("DELETE FROM password_resets WHERE user_id = $1", [req.user.id]);

    return res.json({ message: "Password updated." });
  })
);

// ── Update profile photo ───────────────────────────────────────────
// PATCH /api/users/me/photo  body: { profileImageUrl }
router.patch(
  "/me/photo",
  asyncHandler(async (req, res) => {
    const profileImageUrl = normalizeText(req.body.profileImageUrl) || null;

    const { rows } = await query(
      "UPDATE users SET profile_image_url = $1 WHERE id = $2 RETURNING *",
      [profileImageUrl, req.user.id]
    );

    return res.json({ user: rows[0] });
  })
);

export default router;
