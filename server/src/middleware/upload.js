import multer from "multer";
import path from "path";
import { randomBytes } from "crypto";
import { config } from "../config.js";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/heic"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").slice(0, 8).toLowerCase() || ".jpg";
    const name = `${Date.now()}-${randomBytes(6).toString("hex")}${ext}`;
    cb(null, name);
  },
});

export const uploadImage = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 }, // 6 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) return cb(null, true);
    cb(new Error("Unsupported image type. Use JPG, PNG, WEBP or AVIF."));
  },
});
