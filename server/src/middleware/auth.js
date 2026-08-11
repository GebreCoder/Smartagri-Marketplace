import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { splitAccountRole, USER_TYPES } from "../utils.js";

/** Extract Bearer token from the Authorization header. */
const extractToken = (req) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() === "bearer" && token) return token;
  return null;
};

/** Verify the JWT and attach req.user = { id, email, role }. */
export const requireAuth = (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: "Please sign in again to continue." });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Your session has expired. Please sign in again." });
  }
};

/**
 * Restrict a route to a set of user types.
 * Accepts either the plain base type ('farmer') or a composed role
 * ('farmer', 'farmer_inactive') — base type match is enough.
 */
export const requireRole =
  (...allowedTypes) =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Please sign in again to continue." });
    }
    const { userType } = splitAccountRole(req.user.role);
    if (!allowedTypes.includes(userType)) {
      return res.status(403).json({ message: "You do not have permission to do this." });
    }
    return next();
  };

export const requireAdmin = requireRole(USER_TYPES.ADMIN);
export const requireFarmer = requireRole(USER_TYPES.FARMER);
export const requireBuyer = requireRole(USER_TYPES.BUYER);
