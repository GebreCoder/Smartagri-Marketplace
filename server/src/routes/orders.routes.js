import { Router } from "express";
import { query, withTransaction } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { fetchCartRows, shapeCartItem } from "./cart.routes.js";
import { emitMessageNew, emitOrderChanged } from "../socket.js";
import {
  capitalize,
  formatDateTime,
  formatMoney,
  getProfileName,
  normalizeText,
  ORDER_ACCENT,
  ORDER_ICON,
  shapeProduct,
  toDisplayOrderId,
} from "../utils.js";

const router = Router();
router.use(requireAuth);

// ── helpers ────────────────────────────────────────────────────────
const ORDER_SELECT = `
  SELECT o.id, o.buyer_id, o.product_id, o.quantity, o.status, o.created_at,
         p.id AS p_id, p.farmer_id, p.name, p.category, p.description, p.price,
         p.quantity AS p_quantity, p.location AS p_location, p.image_url AS p_image_url,
         p.created_at AS p_created_at,
         u.full_name AS farmer_full_name, u.location AS farmer_location,
         u.profile_image_url AS farmer_profile_image_url
  FROM orders o
  JOIN products p ON p.id = o.product_id
  LEFT JOIN users u ON u.id = p.farmer_id
`;

const findOrder = async (orderId) => {
  const { rows } = await query(`${ORDER_SELECT} WHERE o.id = $1`, [orderId]);
  return rows[0] || null;
};

const shapeOrderRow = (row) => {
  const product = shapeProduct(
    {
      id: row.p_id,
      farmer_id: row.farmer_id,
      name: row.name,
      category: row.category,
      description: row.description,
      price: row.price,
      quantity: row.p_quantity,
      location: row.p_location,
      image_url: row.p_image_url,
      created_at: row.p_created_at,
    },
    {
      full_name: row.farmer_full_name,
      location: row.farmer_location,
      profile_image_url: row.farmer_profile_image_url,
    }
  );

  const quantity = Math.max(1, Number(row.quantity || 1));
  const price = Number(product?.price || 0);
  const total = price * quantity;

  return {
    id: row.id,
    product_id: row.product_id,
    buyer_id: row.buyer_id,
    quantity,
    status: capitalize(row.status),
    rawStatus: normalizeText(row.status).toLowerCase() || "pending",
    product_name: product?.name || "Product",
    farmer_name: product?.farmer_name || "Farmer",
    farmer_image_url: product?.farmer_image_url || "",
    location: product?.location || "",
    image_url: product?.image_url || "",
    price,
    total,
    total_label: formatMoney(total),
    price_label: formatMoney(price),
    created_at: row.created_at,
    created_label: formatDateTime(row.created_at),
    farmer_id: product?.farmer_id || null,
    product,
  };
};

// ── Place orders from cart ─────────────────────────────────────────
// POST /api/orders/from-cart
router.post(
  "/from-cart",
  asyncHandler(async (req, res) => {
    const cartItems = await fetchCartRows(req.user.id);
    if (!cartItems.length) {
      return res.status(400).json({ message: "Your cart is empty." });
    }

    const createdOrders = await withTransaction(async (client) => {
      const orders = [];
      for (const item of cartItems) {
        const { rows } = await client.query(
          `INSERT INTO orders (buyer_id, product_id, quantity, status)
           VALUES ($1, $2, $3, 'pending')
           RETURNING id, buyer_id, product_id, quantity, status, created_at`,
          [req.user.id, item.product_id, Number(item.quantity || 1)]
        );
        orders.push(rows[0]);
      }
      await client.query("DELETE FROM cart_items WHERE buyer_id = $1", [req.user.id]);
      return orders;
    });

    // Real-time notifications
    const farmerIds = new Set(cartItems.map((item) => item.farmer_id).filter(Boolean));
    createdOrders.forEach((order) => {
      farmerIds.forEach((farmerId) => emitOrderChanged(order.id, req.user.id, farmerId));
    });

    return res.status(201).json({ orders: createdOrders });
  })
);

// ── Place a single order (Buy now) ─────────────────────────────────
// POST /api/orders  body: { productId, quantity }
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const productId = normalizeText(req.body.productId);
    const safeQuantity = Math.max(1, Number(req.body.quantity || 1));

    if (!productId) {
      return res.status(400).json({ message: "Missing product id." });
    }

    const { rows } = await query(
      `INSERT INTO orders (buyer_id, product_id, quantity, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, buyer_id, product_id, quantity, status, created_at`,
      [req.user.id, productId, safeQuantity]
    );

    const product = await query("SELECT farmer_id FROM products WHERE id = $1", [productId]);
    emitOrderChanged(rows[0].id, req.user.id, product.rows[0]?.farmer_id);

    return res.status(201).json({ order: rows[0] });
  })
);

// ── Buyer's orders ─────────────────────────────────────────────────
// GET /api/orders/buyer
router.get(
  "/buyer",
  asyncHandler(async (req, res) => {
    const { rows } = await query(`${ORDER_SELECT} WHERE o.buyer_id = $1 ORDER BY o.created_at DESC`, [req.user.id]);
    return res.json({ orders: rows.map(shapeOrderRow) });
  })
);

// ── Farmer's orders ────────────────────────────────────────────────
// GET /api/orders/farmer
router.get(
  "/farmer",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `${ORDER_SELECT} WHERE p.farmer_id = $1 ORDER BY o.created_at DESC`,
      [req.user.id]
    );

    const orders = rows.map((row) => {
      const shaped = shapeOrderRow(row);
      return {
        ...shaped,
        displayId: toDisplayOrderId(row.id),
        date: formatDateTime(row.created_at),
        product: shaped.product_name,
        buyer: shaped.buyer_id,
        quantityLabel: `${shaped.quantity} kg`,
        amountValue: shaped.total,
        accent: ORDER_ACCENT(shaped.product?.category),
        icon: ORDER_ICON(shaped.product?.category),
        orderId: row.id,
      };
    });

    // Attach buyer display names
    const buyerIds = [...new Set(orders.map((o) => o.buyer).filter(Boolean))];
    const buyerNames = new Map();
    if (buyerIds.length) {
      const { rows: buyerRows } = await query(
        "SELECT id, full_name FROM users WHERE id = ANY($1::uuid[])",
        [buyerIds]
      );
      buyerRows.forEach((b) => buyerNames.set(String(b.id), b.full_name));
    }

    return res.json({
      orders: orders.map((order) => ({ ...order, buyer: getProfileName({ full_name: buyerNames.get(String(order.buyer)) }, "Buyer") })),
    });
  })
);

// ── Update order status (farmer accept / reject) ───────────────────
// PATCH /api/orders/:id/status  body: { status: 'accepted' | 'rejected' }
router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const orderId = normalizeText(req.params.id);
    const cleanStatus = normalizeText(req.body.status).toLowerCase();

    if (!orderId) return res.status(400).json({ message: "Missing order id." });
    if (!["accepted", "rejected"].includes(cleanStatus)) {
      return res.status(400).json({ message: "Invalid order status update." });
    }

    const { rows } = await query("SELECT id, product_id FROM orders WHERE id = $1", [orderId]);
    const order = rows[0];
    if (!order) return res.status(404).json({ message: "Order not found." });

    const { rows: productRows } = await query("SELECT farmer_id FROM products WHERE id = $1", [order.product_id]);
    const product = productRows[0];
    if (!product) return res.status(404).json({ message: "Product not found for this order." });
    if (String(product.farmer_id) !== String(req.user.id)) {
      return res.status(403).json({ message: "You do not have permission to update this order." });
    }

    await query("UPDATE orders SET status = $1 WHERE id = $2", [cleanStatus, orderId]);

    const fullOrder = await findOrder(orderId);
    emitOrderChanged(orderId, fullOrder?.buyer_id, req.user.id);

    return res.json({ message: "Order status updated." });
  })
);

// ── Buyer confirms delivery ────────────────────────────────────────
// POST /api/orders/:id/confirm-delivery
router.post(
  "/:id/confirm-delivery",
  asyncHandler(async (req, res) => {
    const orderId = normalizeText(req.params.id);
    if (!orderId) return res.status(400).json({ message: "Missing order id." });

    const { rows } = await query("SELECT id, product_id, buyer_id FROM orders WHERE id = $1", [orderId]);
    const order = rows[0];
    if (!order) return res.status(404).json({ message: "Order not found." });

    const { rows: productRows } = await query("SELECT farmer_id FROM products WHERE id = $1", [order.product_id]);
    const farmerId = productRows[0]?.farmer_id;
    if (!farmerId) return res.status(400).json({ message: "Could not find farmer for this order." });

    const { rows: inserted } = await query(
      `INSERT INTO messages (order_id, sender_id, receiver_id, message)
       VALUES ($1, $2, $3, 'Buyer confirmed delivery')
       RETURNING id`,
      [orderId, req.user.id, farmerId]
    );

    emitMessageNew({ orderId, senderId: req.user.id, receiverId: farmerId });
    emitOrderChanged(orderId, req.user.id, farmerId);

    return res.status(201).json({ message: "Delivery confirmed.", messageId: inserted[0]?.id });
  })
);

// ── Buyer reports an issue ─────────────────────────────────────────
// POST /api/orders/:id/report-issue  body: { issue }
router.post(
  "/:id/report-issue",
  asyncHandler(async (req, res) => {
    const orderId = normalizeText(req.params.id);
    const issue = normalizeText(req.body.issue);

    if (!orderId) return res.status(400).json({ message: "Missing order id." });
    if (!issue) return res.status(400).json({ message: "Issue details cannot be empty." });

    const { rows } = await query("SELECT id, product_id FROM orders WHERE id = $1", [orderId]);
    const order = rows[0];
    if (!order) return res.status(404).json({ message: "Order not found." });

    const { rows: productRows } = await query("SELECT farmer_id FROM products WHERE id = $1", [order.product_id]);
    const farmerId = productRows[0]?.farmer_id;
    if (!farmerId) return res.status(400).json({ message: "Could not find farmer for this order." });

    await query(
      `INSERT INTO messages (order_id, sender_id, receiver_id, message)
       VALUES ($1, $2, $3, $4)`,
      [orderId, req.user.id, farmerId, `Issue reported: ${issue}`]
    );

    emitMessageNew({ orderId, senderId: req.user.id, receiverId: farmerId });
    emitOrderChanged(orderId, req.user.id, farmerId);

    return res.status(201).json({ message: "Issue reported." });
  })
);

export default router;
