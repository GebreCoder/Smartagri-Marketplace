import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { query } from "../db.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { blocksLogin, normalizeText, splitAccountRole } from "../utils.js";

const router = Router();

// ── helpers ────────────────────────────────────────────────────────
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const signToken = (user) =>
  jwt.sign({ id: user.id, email: user.email, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

const toSafeUser = (row) => ({
  id: row.id,
  full_name: row.full_name,
  email: row.email,
  phone_number: row.phone_number,
  role: row.role,
  business_name: row.business_name,
  location: row.location,
  profile_image_url: row.profile_image_url,
  biography: row.biography,
  created_at: row.created_at,
});

const findUserByIdentity = async (userId, email) => {
  if (userId) {
    const { rows } = await query("SELECT * FROM users WHERE id = $1", [userId]);
    if (rows[0]) return rows[0];
  }
  const normalizedEmail = normalizeText(email).toLowerCase();
  if (normalizedEmail) {
    const { rows } = await query("SELECT * FROM users WHERE LOWER(email) = $1", [normalizedEmail]);
    return rows[0] || null;
  }
  return null;
};

// ── REGISTER ───────────────────────────────────────────────────────
// POST /api/auth/register
// body: { fullName, phoneNumber, email, role, businessName?, location?, password }
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const fullName = normalizeText(req.body.fullName);
    const phoneNumber = normalizeText(req.body.phoneNumber);
    const email = normalizeText(req.body.email).toLowerCase();
    const password = String(req.body.password || "");
    const role = normalizeText(req.body.role).toLowerCase();
    const businessName = normalizeText(req.body.businessName);
    const location = normalizeText(req.body.location);

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "Missing fields. Please fill all required fields." });
    }
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email. Enter a valid email address." });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Weak password. Password must be at least 6 characters." });
    }
    if (!["farmer", "buyer"].includes(role)) {
      return res.status(400).json({ message: "Invalid account role." });
    }

    const existing = await findUserByIdentity(null, email);
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists. Please log in instead." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await query(
      `INSERT INTO users (full_name, email, phone_number, role, business_name, location, password)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [fullName, email, phoneNumber, role, businessName, location, passwordHash]
    );

    const user = toSafeUser(rows[0]);
    return res.status(201).json({ token: signToken(rows[0]), user });
  })
);

// ── LOGIN ──────────────────────────────────────────────────────────
// POST /api/auth/login
// body: { email, password }
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const email = normalizeText(req.body.email).toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Enter both email and password." });
    }

    const user = await findUserByIdentity(null, email);
    if (!user) {
      return res.status(401).json({ message: "Invalid login credentials." });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid login credentials." });
    }

    // Block deactivated accounts (role like 'farmer_inactive' / 'buyer_inactive')
    if (blocksLogin(user.role)) {
      return res.status(403).json({ message: "This account is inactive. Please contact the administrator." });
    }

    return res.json({ token: signToken(user), user: toSafeUser(user) });
  })
);

// ── CURRENT USER ───────────────────────────────────────────────────
// GET /api/auth/me
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await findUserByIdentity(req.user.id, req.user.email);
    if (!user) {
      return res.status(404).json({ message: "Profile not found." });
    }
    return res.json({ user: toSafeUser(user) });
  })
);

// ── FORGOT PASSWORD ────────────────────────────────────────────────
// POST /api/auth/forgot-password  body: { email }
// No email provider is configured, so the reset token is returned in the
// response (and logged) for the client to open the new-password screen.
router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const email = normalizeText(req.body.email).toLowerCase();
    if (!email) {
      return res.status(400).json({ message: "Enter the email address for your account." });
    }

    const user = await findUserByIdentity(null, email);
    if (!user) {
      return res.status(404).json({ message: "No account found with that email address." });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await query("DELETE FROM password_resets WHERE user_id = $1", [user.id]);
    await query(
      "INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)",
      [user.id, token, expiresAt]
    );

    console.log(`[auth] Password reset token for ${email}: ${token}`);
    return res.json({
      message: "Reset token generated. (No email provider is configured, so the token is returned here.)",
      token,
      email,
    });
  })
);

// ── RESET PASSWORD ─────────────────────────────────────────────────
// POST /api/auth/reset-password  body: { token, password }
router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const token = normalizeText(req.body.token);
    const password = String(req.body.password || "");

    if (!token || password.length < 4) {
      return res.status(400).json({ message: "Password must be at least 4 characters." });
    }

    const { rows } = await query(
      "SELECT * FROM password_resets WHERE token = $1 AND used = false AND expires_at > now()",
      [token]
    );
    const reset = rows[0];
    if (!reset) {
      return res.status(400).json({ message: "This reset token is invalid or has expired." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await query("UPDATE users SET password = $1 WHERE id = $2", [passwordHash, reset.user_id]);
    await query("UPDATE password_resets SET used = true WHERE id = $1", [reset.id]);

    return res.json({ message: "Your password has been reset. Please log in with your new password." });
  })
);

// ── LOGOUT ─────────────────────────────────────────────────────────
// POST /api/auth/logout (stateless JWT — the client discards the token)
router.post("/logout", (_req, res) => res.json({ message: "Logged out." }));

// ── shared lookup used by other routes ─────────────────────────────
export { findUserByIdentity, signToken, toSafeUser, splitAccountRole };

export default router;
