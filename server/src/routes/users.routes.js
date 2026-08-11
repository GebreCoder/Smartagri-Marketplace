import { Router } from "express";
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
