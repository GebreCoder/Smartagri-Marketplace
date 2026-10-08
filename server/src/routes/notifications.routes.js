import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";

const router = Router();
router.use(requireAuth);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOTIFICATION_COLUMNS = `id, user_id, actor_id, type, title, body, link, is_read, created_at`;

const shapeNotification = (row) => ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  link: row.link,
  isRead: Boolean(row.is_read),
  createdAt: row.created_at,
});

// ── List the current user's notifications ─────────────────────────
// GET /api/notifications?limit=50
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const { rows } = await query(
      `SELECT ${NOTIFICATION_COLUMNS}
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.id, limit]
    );

    const { rows: unreadRows } = await query(
      `SELECT COUNT(*)::int AS count
       FROM notifications
       WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );

    return res.json({
      notifications: rows.map(shapeNotification),
      unread: unreadRows[0]?.count || 0,
    });
  })
);

// ── Mark a single notification as read ─────────────────────────────
// PATCH /api/notifications/:id/read
router.patch(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const notificationId = req.params.id;
    if (!UUID_RE.test(String(notificationId || ""))) {
      return res.status(404).json({ message: "Notification not found." });
    }
    const { rows } = await query(
      `UPDATE notifications SET is_read = true
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [notificationId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Notification not found." });
    return res.json({ ok: true });
  })
);

// ── Mark all as read ───────────────────────────────────────────────
// POST /api/notifications/read-all
router.post(
  "/read-all",
  asyncHandler(async (_req, res) => {
    await query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
      [_req.user.id]
    );
    return res.json({ ok: true });
  })
);

export default router;
