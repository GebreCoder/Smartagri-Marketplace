import { Router } from "express";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { uploadImage } from "../middleware/upload.js";
import { config } from "../config.js";

const router = Router();

// ── Upload image ───────────────────────────────────────────────────
// POST /api/upload  (multipart/form-data, field name: "image")
router.post(
  "/",
  requireAuth,
  uploadImage.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No image file was provided." });
    }

    const filePath = req.file.filename;
    const publicUrl = `${config.publicUrl}/uploads/${filePath}`;

    return res.status(201).json({
      url: publicUrl,
      path: filePath,
      originalName: req.file.originalname,
    });
  })
);

// ── Delete uploaded image ──────────────────────────────────────────
// DELETE /api/upload  body: { path }
router.delete(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const fileName = String(req.body.path || "").trim();
    if (!fileName) return res.status(400).json({ message: "Missing file path." });

    const safeName = path.basename(fileName); // prevent traversal
    const fullPath = path.join(config.uploadsDir, safeName);

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    return res.json({ message: "Image deleted." });
  })
);

export default router;
