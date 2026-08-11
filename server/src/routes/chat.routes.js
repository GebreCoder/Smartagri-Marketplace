import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { emitMessageNew } from "../socket.js";
import {
  capitalize,
  getProfileName,
  normalizeText,
  resolveImageUrl,
  shapeProduct,
} from "../utils.js";

const router = Router();
router.use(requireAuth);

// ── helpers ────────────────────────────────────────────────────────
const formatDateShort = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const PRODUCT_SHAPE_SQL = `
  SELECT p.id, p.farmer_id, p.name, p.category, p.description, p.price, p.quantity,
         p.location, p.image_url, p.created_at,
         u.full_name AS farmer_full_name, u.location AS farmer_location,
         u.profile_image_url AS farmer_profile_image_url
  FROM products p
  LEFT JOIN users u ON u.id = p.farmer_id
`;

const shapeProductRow = (row) =>
  shapeProduct(row, {
    full_name: row.farmer_full_name,
    location: row.farmer_location,
    profile_image_url: row.farmer_profile_image_url,
  });

const latestMessagesForOrders = async (orderIds) => {
  if (!orderIds.length) return new Map();
  const { rows } = await query(
    `SELECT id, order_id, sender_id, receiver_id, message, created_at
     FROM messages
     WHERE order_id = ANY($1::uuid[])
     ORDER BY created_at DESC`,
    [orderIds]
  );
  const latest = new Map();
  rows.forEach((row) => {
    if (!latest.has(String(row.order_id))) latest.set(String(row.order_id), row);
  });
  return latest;
};

// ── Conversations ──────────────────────────────────────────────────
// GET /api/chat/conversations?role=buyer|farmer
router.get(
  "/conversations",
  asyncHandler(async (req, res) => {
    const role = normalizeText(req.query.role).toLowerCase() || "buyer";
    const isFarmerView = role === "farmer";

    if (isFarmerView) {
      const { rows: productRows } = await query(
        `${PRODUCT_SHAPE_SQL} WHERE p.farmer_id = $1 ORDER BY p.created_at DESC`,
        [req.user.id]
      );
      if (!productRows.length) return res.json({ conversations: [] });

      const productIds = productRows.map((row) => row.id);
      const { rows: orderRows } = await query(
        `SELECT id, buyer_id, product_id, quantity, status, created_at
         FROM orders
         WHERE product_id = ANY($1::uuid[])
         ORDER BY created_at DESC`,
        [productIds]
      );

      const productMap = new Map(productRows.map((row) => [String(row.id), row]));
      const safeOrders = orderRows.filter((order) => productMap.has(String(order.product_id)));

      const buyerIds = [...new Set(safeOrders.map((order) => order.buyer_id).filter(Boolean))];
      const buyersMap = new Map();
      if (buyerIds.length) {
        const { rows: buyerRows } = await query(
          "SELECT id, full_name, location, profile_image_url FROM users WHERE id = ANY($1::uuid[])",
          [buyerIds]
        );
        buyerRows.forEach((row) => buyersMap.set(String(row.id), row));
      }

      const latest = await latestMessagesForOrders(safeOrders.map((order) => order.id));

      const conversations = safeOrders.map((order) => {
        const product = productMap.get(String(order.product_id));
        const buyer = buyersMap.get(String(order.buyer_id));
        const latestMsg = latest.get(String(order.id));
        const status = capitalize(order.status);
        const rawStatus = normalizeText(order.status).toLowerCase() || "pending";

        return {
          id: order.id,
          order_id: order.id,
          orderId: order.id,
          name: getProfileName(buyer, "Buyer"),
          product: normalizeText(product?.name) || "Product",
          status,
          rawStatus,
          canChat: rawStatus === "accepted",
          quantity: Number(order.quantity || 1),
          lastMessage: latestMsg?.message || `Order ${status.toLowerCase()} - tap to open thread.`,
          time: latestMsg ? formatDateShort(latestMsg.created_at) : formatDateShort(order.created_at),
          image: resolveImageUrl(product?.image_url),
          buyerId: order.buyer_id,
          productId: order.product_id,
          latestMessageAt: latestMsg?.created_at || order.created_at,
        };
      });

      return res.json({ conversations });
    }

    // ── buyer view ──
    const { rows: orderRows } = await query(
      `SELECT o.id, o.buyer_id, o.product_id, o.quantity, o.status, o.created_at
       FROM orders o
       WHERE o.buyer_id = $1 AND o.status = 'accepted'
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );

    const productIds = [...new Set(orderRows.map((row) => row.product_id).filter(Boolean))];
    const productsMap = new Map();
    if (productIds.length) {
      const { rows: productRows } = await query(
        `${PRODUCT_SHAPE_SQL} WHERE p.id = ANY($1::uuid[])`,
        [productIds]
      );
      productRows.forEach((row) => productsMap.set(String(row.id), shapeProductRow(row)));
    }

    const latest = await latestMessagesForOrders(orderRows.map((order) => order.id));

    const conversations = orderRows.map((order) => {
      const product = productsMap.get(String(order.product_id));
      const latestMsg = latest.get(String(order.id));
      const status = capitalize(order.status);

      return {
        id: order.id,
        order_id: order.id,
        orderId: order.id,
        name: product?.farmer_name || "Farmer",
        product: product?.name || "Product",
        lastMessage: latestMsg?.message || `Order ${status.toLowerCase()} - tap to chat.`,
        time: latestMsg ? formatDateShort(latestMsg.created_at) : formatDateShort(order.created_at),
        unread: latestMsg ? 1 : 0,
        image: product?.farmer_image_url || product?.image_url,
        online: true,
        status,
        rawStatus: normalizeText(order.status).toLowerCase() || "pending",
        productId: order.product_id,
        farmerId: product?.farmer_id || null,
        latestMessageAt: latestMsg?.created_at || order.created_at,
      };
    });

    return res.json({ conversations });
  })
);

// ── Thread ─────────────────────────────────────────────────────────
// GET /api/chat/threads/:orderId?role=buyer|farmer
router.get(
  "/threads/:orderId",
  asyncHandler(async (req, res) => {
    const orderId = normalizeText(req.params.orderId);
    const isFarmerView = normalizeText(req.query.role).toLowerCase() === "farmer";
    if (!orderId) return res.status(400).json({ message: "Missing order id." });

    const { rows: orderRows } = await query(
      "SELECT id, buyer_id, product_id, quantity, status, created_at FROM orders WHERE id = $1",
      [orderId]
    );
    const order = orderRows[0];
    if (!order) return res.status(404).json({ message: "Order not found." });

    const { rows: productRows } = await query(
      `${PRODUCT_SHAPE_SQL} WHERE p.id = $1`,
      [order.product_id]
    );
    const productRow = productRows[0];
    if (!productRow) return res.status(404).json({ message: "Product not found." });

    const ownerId = isFarmerView ? productRow.farmer_id : order.buyer_id;
    if (String(ownerId || "") !== String(req.user.id)) {
      return res.status(403).json({ message: "You do not have access to this conversation." });
    }

    const product = shapeProductRow(productRow);

    const { rows: buyerRows } = await query("SELECT id, full_name FROM users WHERE id = $1", [order.buyer_id]);
    const buyerProfile = buyerRows[0] || null;

    const { rows: messages } = await query(
      `SELECT id, order_id, sender_id, receiver_id, message, created_at
       FROM messages
       WHERE order_id = $1
       ORDER BY created_at ASC`,
      [orderId]
    );

    return res.json({
      order,
      product,
      role: isFarmerView ? "farmer" : "buyer",
      farmer: product?.farmer_name || "Farmer",
      farmerId: product?.farmer_id || null,
      buyer: getProfileName(buyerProfile, "Buyer"),
      buyerId: order.buyer_id || null,
      participantName: isFarmerView ? getProfileName(buyerProfile, "Buyer") : product?.farmer_name || "Farmer",
      participantId: isFarmerView ? order.buyer_id || null : product?.farmer_id || null,
      selfId: String(req.user.id || ""),
      messages,
      canChat: normalizeText(order.status).toLowerCase() === "accepted",
    });
  })
);

// ── Send message ───────────────────────────────────────────────────
// POST /api/chat/threads/:orderId/messages
// body: { message, receiverId?, role? }
router.post(
  "/threads/:orderId/messages",
  asyncHandler(async (req, res) => {
    const orderId = normalizeText(req.params.orderId);
    const text = normalizeText(req.body.message);
    const isFarmerView = normalizeText(req.body.role).toLowerCase() === "farmer";
    const providedReceiverId = normalizeText(req.body.receiverId);

    if (!text) return res.status(400).json({ message: "Message cannot be empty." });
    if (!orderId) return res.status(400).json({ message: "Missing order id for this message." });

    let targetReceiverId = providedReceiverId;

    if (!targetReceiverId) {
      const { rows: orderRows } = await query("SELECT id, buyer_id, product_id FROM orders WHERE id = $1", [orderId]);
      const order = orderRows[0];
      if (!order) return res.status(404).json({ message: "Order not found for this conversation." });

      const { rows: productRows } = await query("SELECT farmer_id FROM products WHERE id = $1", [order.product_id]);
      const productRow = productRows[0];
      if (!productRow) return res.status(404).json({ message: "Product not found." });

      const allowedOwnerId = isFarmerView ? productRow.farmer_id : order.buyer_id;
      if (String(allowedOwnerId || "") !== String(req.user.id)) {
        return res.status(403).json({ message: "You do not have access to this conversation." });
      }

      targetReceiverId = isFarmerView ? normalizeText(order.buyer_id) : normalizeText(productRow.farmer_id);
    }

    if (!targetReceiverId) {
      return res.status(400).json({ message: "Could not determine the receiver for this chat." });
    }

    const { rows } = await query(
      `INSERT INTO messages (order_id, sender_id, receiver_id, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, order_id, sender_id, receiver_id, message, created_at`,
      [orderId, req.user.id, targetReceiverId, text]
    );

    emitMessageNew({ orderId, senderId: req.user.id, receiverId: targetReceiverId });

    return res.status(201).json({ message: rows[0] });
  })
);

export default router;
