import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { emitDirectMessage, emitMessageNew, isUserOnline } from "../socket.js";
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

// ════════════════════════════════════════════════════════════════
// DIRECT MESSAGING (Telegram/Facebook-style 1:1 chat between any users)
// ════════════════════════════════════════════════════════════════

const DIRECT_USER_COLUMNS = `id, full_name, business_name, role, location, profile_image_url, biography`;
const DIRECT_USER_SELECT = `
  SELECT ${DIRECT_USER_COLUMNS}
  FROM users
`;

const shapeDirectUser = (row) => ({
  id: row.id,
  full_name: getProfileName(row, "User"),
  role: normalizeText(row.role).toLowerCase().split("_")[0] || "user",
  location: row.location || "",
  biography: row.biography || "",
  image_url: resolveImageUrl(row.profile_image_url),
  online: isUserOnline(row.id),
});

// Normalize a pair so user_a < user_b for the canonical unique row.
const sortPair = (a, b) => (String(a) < String(b) ? [a, b] : [b, a]);

// Get-or-create a direct conversation between two users.
const findOrCreateConversation = async (userA, userB) => {
  const [a, b] = sortPair(userA, userB);
  const { rows: existing } = await query(
    `SELECT * FROM conversations WHERE user_a = $1 AND user_b = $2`,
    [a, b]
  );
  if (existing[0]) return existing[0];
  const { rows: created } = await query(
    `INSERT INTO conversations (user_a, user_b) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING *`,
    [a, b]
  );
  if (created[0]) return created[0];
  const { rows: raced } = await query(
    `SELECT * FROM conversations WHERE user_a = $1 AND user_b = $2`,
    [a, b]
  );
  return raced[0] || null;
};

// ── List registered users to chat with ─────────────────────────────
// GET /api/chat/users?role=buyer|farmer  → users of the opposite role (contacts)
router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const role = normalizeText(req.query.role).toLowerCase().split("_")[0] || "all";
    const activeRoles = role === "all" ? ["farmer", "buyer"] : [role];
    const { rows } = await query(
      `${DIRECT_USER_SELECT}
       WHERE role = ANY($1::text[]) AND id <> $2
       ORDER BY full_name ASC`,
      [activeRoles, req.user.id]
    );
    return res.json({ users: rows.map(shapeDirectUser) });
  })
);

// ── My direct conversations ────────────────────────────────────────
// GET /api/chat/direct?q=<search across messages>
router.get(
  "/direct",
  asyncHandler(async (req, res) => {
    const q = normalizeText(req.query.q);
    const { rows } = await query(
      `SELECT c.id, c.user_a, c.user_b, c.created_at, c.last_message_at,
              partner.id AS partner_id,
              partner.full_name AS partner_full_name,
              partner.business_name AS partner_business,
              partner.role AS partner_role,
              partner.location AS partner_location,
              partner.profile_image_url AS partner_image,
              (SELECT COALESCE(NULLIF(m.message, ''), CASE WHEN m.image_url IS NOT NULL THEN '📷 Photo' ELSE '' END)
                FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
              (SELECT COUNT(*)::int FROM messages m
                WHERE m.conversation_id = c.id
                  AND m.receiver_id = $1 AND m.is_read = false) AS unread
       FROM conversations c
       JOIN users partner
         ON partner.id = CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END
       WHERE (c.user_a = $1 OR c.user_b = $1)
         AND (
           $2 = '' OR
           LOWER(COALESCE(partner.full_name, '')) LIKE '%' || LOWER($2) || '%' OR
           LOWER(COALESCE(partner.business_name, '')) LIKE '%' || LOWER($2) || '%' OR
           EXISTS (
             SELECT 1 FROM messages m
             WHERE m.conversation_id = c.id
               AND LOWER(COALESCE(m.message, '')) LIKE '%' || LOWER($2) || '%'
           )
         )
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
      [req.user.id, q]
    );

    return res.json({
      conversations: rows.map((row) => ({
        id: row.id,
        partner: {
          id: row.partner_id,
          full_name: getProfileName(
            { full_name: row.partner_full_name, business_name: row.partner_business },
            "User"
          ),
          role: normalizeText(row.partner_role).toLowerCase().split("_")[0] || "user",
          location: row.partner_location || "",
          image_url: resolveImageUrl(row.partner_image),
          online: isUserOnline(row.partner_id),
        },
        lastMessage: row.last_message || "",
        lastMessageAt: row.last_message_at || row.created_at,
        time: formatDateShort(row.last_message_at || row.created_at),
        unread: Number(row.unread || 0),
      })),
    });
  })
);

// ── Start a conversation with a user ───────────────────────────────
// POST /api/chat/direct  body: { userId }
router.post(
  "/direct",
  asyncHandler(async (req, res) => {
    const partnerId = normalizeText(req.body.userId);
    if (!partnerId) return res.status(400).json({ message: "Missing user id." });
    if (String(partnerId) === String(req.user.id)) {
      return res.status(400).json({ message: "You cannot start a chat with yourself." });
    }

    const { rows: partnerRows } = await query(
      `${DIRECT_USER_SELECT} WHERE id = $1`,
      [partnerId]
    );
    const partner = partnerRows[0];
    if (!partner) return res.status(404).json({ message: "User not found." });

    const conversation = await findOrCreateConversation(req.user.id, partnerId);
    return res.status(201).json({
      conversation: {
        id: conversation.id,
        partner: shapeDirectUser(partner),
      },
    });
  })
);

// ── Conversation thread ────────────────────────────────────────────
// GET /api/chat/direct/:conversationId
router.get(
  "/direct/:conversationId",
  asyncHandler(async (req, res) => {
    const conversationId = normalizeText(req.params.conversationId);
    if (!conversationId) return res.status(400).json({ message: "Missing conversation id." });

    const { rows: convRows } = await query(
      "SELECT * FROM conversations WHERE id = $1",
      [conversationId]
    );
    const conversation = convRows[0];
    if (!conversation) return res.status(404).json({ message: "Conversation not found." });

    const selfId = String(req.user.id);
    const isParticipant =
      String(conversation.user_a) === selfId || String(conversation.user_b) === selfId;
    if (!isParticipant) {
      return res.status(403).json({ message: "You do not have access to this conversation." });
    }

    const partnerId = String(conversation.user_a) === selfId ? conversation.user_b : conversation.user_a;
    const { rows: partnerRows } = await query(
      `SELECT ${DIRECT_USER_COLUMNS}, read_receipts FROM users WHERE id = $1`,
      [partnerId]
    );
    const partner = partnerRows[0] || null;

    // Always mark incoming messages as read (clears the receiver's unread badge).
    // Read-receipt privacy is handled below when shaping the response.
    await query(
      `UPDATE messages SET is_read = true
       WHERE conversation_id = $1 AND receiver_id = $2 AND is_read = false`,
      [conversationId, req.user.id]
    );

    const { rows: messages } = await query(
      `SELECT id, conversation_id, sender_id, receiver_id, message, image_url, created_at, is_read
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );

    // If the partner disabled read receipts, hide blue ticks from senders:
    // the sender's own outgoing messages are reported as unread.
    const partnerSendsReceipts = partner?.read_receipts !== false;

    return res.json({
      conversation: { id: conversation.id },
      partner: partner ? shapeDirectUser(partner) : null,
      selfId,
      messages: messages.map((m) => ({
        id: m.id,
        sender_id: m.sender_id,
        receiver_id: m.receiver_id,
        message: m.message,
        image_url: resolveImageUrl(m.image_url),
        created_at: m.created_at,
        // Outgoing messages show a read tick only if the partner sends receipts.
        is_read: String(m.sender_id) === selfId && !partnerSendsReceipts ? false : m.is_read,
      })),
    });
  })
);

// ── Send a direct message ──────────────────────────────────────────
// POST /api/chat/direct/:conversationId/messages  body: { message?, imageUrl? }
router.post(
  "/direct/:conversationId/messages",
  asyncHandler(async (req, res) => {
    const conversationId = normalizeText(req.params.conversationId);
    const text = normalizeText(req.body.message);
    const rawImageUrl = normalizeText(req.body.imageUrl) || null;
    // Only allow same-origin uploaded images or plain http(s) URLs.
    const imageUrl =
      rawImageUrl && /^(https?:\/\/|\/uploads\/)/i.test(rawImageUrl) ? rawImageUrl : null;
    if (!text && !imageUrl) return res.status(400).json({ message: "Message cannot be empty." });

    const { rows: convRows } = await query(
      "SELECT * FROM conversations WHERE id = $1",
      [conversationId]
    );
    const conversation = convRows[0];
    if (!conversation) return res.status(404).json({ message: "Conversation not found." });

    const selfId = String(req.user.id);
    const isParticipant =
      String(conversation.user_a) === selfId || String(conversation.user_b) === selfId;
    if (!isParticipant) {
      return res.status(403).json({ message: "You do not have access to this conversation." });
    }

    const receiverId =
      String(conversation.user_a) === selfId ? conversation.user_b : conversation.user_a;

    const { rows } = await query(
      `INSERT INTO messages (conversation_id, sender_id, receiver_id, message, image_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, conversation_id, sender_id, receiver_id, message, image_url, created_at, is_read`,
      [conversationId, req.user.id, receiverId, text, imageUrl]
    );
    await query("UPDATE conversations SET last_message_at = now() WHERE id = $1", [conversationId]);

    emitDirectMessage({
      conversationId,
      senderId: req.user.id,
      receiverId,
      message: text,
      imageUrl,
      senderName: getProfileName(req.user, "User"),
    });

    return res.status(201).json({ message: rows[0] });
  })
);

export default router;
