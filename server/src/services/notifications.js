import { query } from "../db.js";
import { emitToUser } from "../socket.js";

/**
 * Insert a timeline event for an order and return the new row.
 * `client` is optional — pass it to run inside an existing transaction.
 */
export const addOrderEvent = async ({ orderId, actorId, actorRole, eventType, label, note = "", client }) => {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(
    `INSERT INTO order_events (order_id, actor_id, actor_role, event_type, label, note)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, order_id, actor_id, actor_role, event_type, label, note, created_at`,
    [orderId, actorId ?? null, actorRole ?? "", eventType, label, note]
  );
  return rows[0];
};

/**
 * Persist an in-app notification for a user and push it to their open
 * socket(s) in realtime. `client` is optional (transaction support).
 */
export const createNotification = async ({ userId, actorId = null, type = "system", title, body = "", link = "" }) => {
  const { rows } = await query(
    `INSERT INTO notifications (user_id, actor_id, type, title, body, link)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, actor_id, type, title, body, link, is_read, created_at`,
    [userId, actorId, type, title, body, link]
  );
  const notification = rows[0];
  emitToUser(userId, "notification:new", notification);
  return notification;
};

/**
 * Convenience: notify both sides of an order about a lifecycle change.
 * `extra` can hold per-recipient overrides ({ buyer, farmer }).
 */
export const notifyOrderParties = async ({ orderId, buyerId, farmerId, productName = "", orderTitle, orderBody, link = "" }) => {
  const title = orderTitle ?? "Order update";
  const body = orderBody ?? `Order ${String(orderId).slice(0, 8).toUpperCase()} has a new update.`;
  const notifs = [];
  if (buyerId) notifs.push(await createNotification({ userId: buyerId, type: "order", title, body, link }));
  if (farmerId) notifs.push(await createNotification({ userId: farmerId, type: "order", title, body, link }));
  return notifs;
};
