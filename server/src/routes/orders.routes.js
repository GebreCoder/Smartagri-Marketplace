import { Router } from "express";
import { query, withTransaction } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { fetchCartRows, shapeCartItem } from "./cart.routes.js";
import { emitMessageNew, emitOrderChanged } from "../socket.js";
import { addOrderEvent, createNotification } from "../services/notifications.js";
import {
  buildOrderSteps,
  capitalize,
  DELIVERY_METHOD_LABEL,
  formatDateTime,
  formatMoney,
  getProfileName,
  normalizeText,
  ORDER_ACCENT,
  ORDER_ICON,
  ORDER_STATUS_LABEL,
  shapeProduct,
  toDisplayOrderId,
} from "../utils.js";
import {
  centsToEtb,
  computeFinancials,
  createSettlementForOrder,
  genRef,
  PLATFORM_FEE_PERCENT,
  recordLedgerEntry,
  syncPaymentSettlementStatus,
} from "../services/finance.js";

const router = Router();
router.use(requireAuth);

// Flat delivery fee charged per batch when the buyer chooses home delivery
// (matches the fee shown in the cart). Farm pickup is always free.
export const FLAT_DELIVERY_FEE = 180;

const DELIVERY_METHODS = ["delivery", "pickup"];

// ── helpers ────────────────────────────────────────────────────────
const ORDER_SELECT = `
  SELECT o.id, o.buyer_id, o.product_id, o.quantity, o.status, o.created_at,
         o.delivery_method, o.delivery_address, o.delivery_notes, o.delivery_fee,
         o.accepted_at, o.preparing_at, o.ready_at, o.dispatched_at, o.delivered_at,
         o.completed_at, o.confirmed_at, o.confirmed_by, o.group_reference, o.client_ref,
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
  const subtotal = price * quantity;
  const deliveryFee = Math.max(0, Number(row.delivery_fee || 0));
  const total = subtotal + deliveryFee;
  const financials = computeFinancials({ unitPrice: price, quantity, deliveryFee });
  const deliveryMethod = normalizeText(row.delivery_method).toLowerCase() || "delivery";
  const rawStatus = normalizeText(row.status).toLowerCase() || "pending";

  return {
    id: row.id,
    product_id: row.product_id,
    buyer_id: row.buyer_id,
    quantity,
    status: ORDER_STATUS_LABEL[rawStatus] || capitalize(row.status),
    rawStatus,
    product_name: product?.name || "Product",
    farmer_name: product?.farmer_name || "Farmer",
    farmer_image_url: product?.farmer_image_url || "",
    location: product?.location || "",
    image_url: product?.image_url || "",
    price,
    subtotal,
    subtotal_label: formatMoney(subtotal),
    delivery_fee: deliveryFee,
    delivery_fee_label: formatMoney(deliveryFee),
    delivery_method: deliveryMethod,
    delivery_method_label: DELIVERY_METHOD_LABEL[deliveryMethod] || "Home delivery",
    delivery_address: normalizeText(row.delivery_address),
    delivery_notes: normalizeText(row.delivery_notes),
    accepted_at: row.accepted_at,
    preparing_at: row.preparing_at,
    ready_at: row.ready_at,
    dispatched_at: row.dispatched_at,
    delivered_at: row.delivered_at,
    completed_at: row.completed_at,
    confirmed_at: row.confirmed_at,
    confirmed_by: row.confirmed_by,
    group_reference: row.group_reference || "",
    total,
    total_label: formatMoney(total),
    price_label: formatMoney(price),
    // Backend-computed fee breakdown shown at payment time: the buyer pays
    // subtotal + delivery + a configurable platform fee; the farmer nets
    // subtotal + delivery once the order completes.
    platform_fee: financials.platformCents / 100,
    platform_fee_label: centsToEtb(financials.platformCents),
    payment_total: (total * 100 + financials.platformCents) / 100,
    payment_total_label: centsToEtb(financials.totalCents),
    created_at: row.created_at,
    created_label: formatDateTime(row.created_at),
    farmer_id: product?.farmer_id || null,
    product,
  };
};

// Build the set of order ids already covered by a succeeded payment.
const getPaidOrderIds = async (orderIds) => {
  const ids = [...new Set(orderIds.map(String).filter(Boolean))];
  if (!ids.length) return new Set();
  const { rows } = await query(
    `SELECT order_ids FROM payments
     WHERE status IN ('succeeded', 'awaiting_settlement', 'settled', 'partially_refunded')
       AND order_ids ?| $1::text[]`,
    [ids]
  );
  const paid = new Set();
  rows.forEach((row) => {
    (Array.isArray(row.order_ids) ? row.order_ids : []).forEach((id) => paid.add(String(id)));
  });
  return paid;
};

// Fetch the full timeline for a set of orders (oldest first).
const getOrderEvents = async (orderIds) => {
  const ids = [...new Set(orderIds.map(String).filter(Boolean))];
  if (!ids.length) return new Map();
  const { rows } = await query(
    `SELECT id, order_id, actor_id, actor_role, event_type, label, note, created_at
     FROM order_events
     WHERE order_id = ANY($1::uuid[])
     ORDER BY created_at ASC`,
    [ids]
  );
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(String(row.order_id))) map.set(String(row.order_id), []);
    map.get(String(row.order_id)).push({
      id: row.id,
      eventType: row.event_type,
      label: row.label,
      note: row.note,
      createdAt: row.created_at,
      createdLabel: formatDateTime(row.created_at),
    });
  });
  return map;
};

// Augment shaped orders with payment state, timeline and the step tracker.
const attachMeta = async (orders) => {
  if (!orders.length) return orders;
  const ids = orders.map((o) => o.id);
  const [paidSet, eventsMap] = await Promise.all([getPaidOrderIds(ids), getOrderEvents(ids)]);
  return orders.map((o) => {
    const isPaid = paidSet.has(String(o.id));
    const events = eventsMap.get(String(o.id)) || [];
    const tracker = buildOrderSteps(o.rawStatus, isPaid);
    return {
      ...o,
      is_paid: isPaid,
      events,
      steps: tracker.steps,
      trackerTerminal: tracker.terminal,
      trackerTerminalLabel: tracker.terminalLabel,
    };
  });
};

const notifyFarmerOfNewOrder = async ({ orderId, farmerId, buyerName, productName, quantity }) => {
  if (!farmerId) return;
  await createNotification({
    userId: farmerId,
    type: "order",
    title: "New order received",
    body: `${buyerName} ordered ${quantity} kg of ${productName || "your product"}.`,
    link: "/farmer/orders",
  });
};

const getUserDisplayName = async (userId) => {
  if (!userId) return "A user";
  const { rows } = await query("SELECT full_name FROM users WHERE id = $1", [userId]);
  return getProfileName(rows[0], "A user");
};

/**
 * Read + sanitize checkout delivery info from the request body.
 * Returns { deliveryMethod, deliveryAddress, deliveryNotes, deliveryFee }.
 * Home delivery charges the flat fee; farm pickup is free.
 */
const readDeliveryInfo = (req, orderCount) => {
  const method = normalizeText(req.body.deliveryMethod).toLowerCase();
  const deliveryMethod = DELIVERY_METHODS.includes(method) ? method : "delivery";
  const deliveryAddress = normalizeText(req.body.deliveryAddress).slice(0, 300);
  const deliveryNotes = normalizeText(req.body.deliveryNotes).slice(0, 300);
  // Distribute the flat batch fee evenly across the batch so each order
  // carries its own share and the payment total matches the cart exactly.
  const count = Math.max(1, Number(orderCount || 1));
  const fee = deliveryMethod === "delivery" && count > 0 ? FLAT_DELIVERY_FEE : 0;
  const base = Math.floor(fee / count);
  const remainder = fee % count;
  return { deliveryMethod, deliveryAddress, deliveryNotes, base, remainder };
};

// ── Place orders from cart ─────────────────────────────────────────
// POST /api/orders/from-cart
// body: { deliveryMethod?, deliveryAddress?, deliveryNotes?, clientRef? }
// Validates inventory under a row lock, groups every line into one
// checkout (group_reference) and is idempotent via clientRef.
router.post(
  "/from-cart",
  asyncHandler(async (req, res) => {
    const cartItems = await fetchCartRows(req.user.id);
    if (!cartItems.length) {
      return res.status(400).json({ message: "Your cart is empty." });
    }

    const delivery = readDeliveryInfo(req, cartItems.length);
    if (delivery.deliveryMethod === "delivery" && !delivery.deliveryAddress) {
      return res.status(400).json({ message: "Please provide a delivery address." });
    }

    const clientRef = normalizeText(req.body.clientRef).slice(0, 74);
    if (clientRef) {
      // Idempotency: a retry of the same checkout returns the orders that
      // were already created instead of duplicating them. Each order in a
      // batch stores `clientRef#n` (unique per row), so we match the exact
      // ref (single order) or its batch prefix.
      const { rows: existing } = await query(
        `SELECT id FROM orders WHERE buyer_id = $1 AND (client_ref = $2 OR client_ref LIKE $2 || '#%')`,
        [req.user.id, clientRef]
      );
      if (existing.length) {
        return res.status(200).json({ orders: existing, duplicate: true });
      }
    }

    const groupReference = genRef("ORD");
    const createdOrders = await withTransaction(async (client) => {
      const orders = [];
      for (let i = 0; i < cartItems.length; i += 1) {
        const item = cartItems[i];
        const orderedQty = Number(item.quantity || 1);
        // Unique per order within the batch — the (buyer_id, client_ref)
        // unique index guards against duplicate checkouts.
        const rowClientRef = clientRef ? `${clientRef}#${i + 1}` : "";

        // Lock the product row so two buyers checking out at the same time
        // can never both reserve the same stock.
        const { rows: productRows } = await client.query(
          `SELECT id, quantity, price, name FROM products WHERE id = $1 FOR UPDATE`,
          [item.product_id]
        );
        const productRow = productRows[0];
        if (!productRow) {
          throw Object.assign(new Error(`${item.name || "A product"} is no longer available.`), { status: 400 });
        }
        if (Number(productRow.quantity || 0) < orderedQty) {
          throw Object.assign(
            new Error(`Only ${productRow.quantity} available for ${item.name || "this product"} — you asked for ${orderedQty}.`),
            { status: 400 }
          );
        }

        const fee = delivery.deliveryMethod === "delivery" ? delivery.base + (i < delivery.remainder ? 1 : 0) : 0;
        const { rows } = await client.query(
          `INSERT INTO orders (buyer_id, product_id, quantity, status, delivery_method, delivery_address, delivery_notes, delivery_fee, group_reference, client_ref)
           VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9)
           RETURNING id, buyer_id, product_id, quantity, status, group_reference, created_at`,
          [req.user.id, item.product_id, orderedQty, delivery.deliveryMethod, delivery.deliveryAddress, delivery.deliveryNotes, fee, groupReference, rowClientRef]
        );
        const order = rows[0];
        await addOrderEvent({
          client,
          orderId: order.id,
          actorId: req.user.id,
          actorRole: "buyer",
          eventType: "placed",
          label: "Order placed",
          note: `${orderedQty} kg · ${item.name || "Product"} · ${DELIVERY_METHOD_LABEL[delivery.deliveryMethod]}`,
        });
        orders.push(order);
      }
      await client.query("DELETE FROM cart_items WHERE buyer_id = $1", [req.user.id]);
      return orders;
    });

    // Real-time notifications
    const buyerName = await getUserDisplayName(req.user.id);
    createdOrders.forEach((order, index) => {
      const farmerId = cartItems[index]?.farmer_id;
      emitOrderChanged(order.id, req.user.id, farmerId);
    });
    await Promise.all(
      cartItems.map((item, index) => {
        const createdOrder = createdOrders[index];
        return notifyFarmerOfNewOrder({
          orderId: createdOrder?.id || item.product_id,
          farmerId: item.farmer_id,
          buyerName,
          productName: item.name,
          quantity: Number(item.quantity || 1),
        });
      })
    );

    return res.status(201).json({ orders: createdOrders });
  })
);

// ── Place a single order (Buy now) ─────────────────────────────────
// POST /api/orders  body: { productId, quantity, deliveryMethod?, deliveryAddress?, deliveryNotes?, clientRef? }
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const productId = normalizeText(req.body.productId);
    const safeQuantity = Math.max(1, Number(req.body.quantity || 1));

    if (!productId) {
      return res.status(400).json({ message: "Missing product id." });
    }

    const clientRef = normalizeText(req.body.clientRef).slice(0, 80);
    if (clientRef) {
      const { rows: existing } = await query(
        "SELECT id FROM orders WHERE buyer_id = $1 AND client_ref = $2",
        [req.user.id, clientRef]
      );
      if (existing.length) {
        return res.status(200).json({ order: existing[0], duplicate: true });
      }
    }

    const delivery = readDeliveryInfo(req, 1);
    if (delivery.deliveryMethod === "delivery" && !delivery.deliveryAddress) {
      return res.status(400).json({ message: "Please provide a delivery address." });
    }
    const fee = delivery.deliveryMethod === "delivery" ? delivery.base : 0;

    const order = await withTransaction(async (client) => {
      const { rows: productRows } = await client.query(
        `SELECT id, farmer_id, name, quantity FROM products WHERE id = $1 FOR UPDATE`,
        [productId]
      );
      const productRow = productRows[0];
      if (!productRow) {
        throw Object.assign(new Error("This product is no longer available."), { status: 400 });
      }
      if (Number(productRow.quantity || 0) < safeQuantity) {
        throw Object.assign(
          new Error(`Only ${productRow.quantity} available — you asked for ${safeQuantity}.`),
          { status: 400 }
        );
      }

      const groupReference = genRef("ORD");
      const { rows } = await client.query(
        `INSERT INTO orders (buyer_id, product_id, quantity, status, delivery_method, delivery_address, delivery_notes, delivery_fee, group_reference, client_ref)
         VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9)
         RETURNING id, buyer_id, product_id, quantity, status, group_reference, created_at`,
        [req.user.id, productId, safeQuantity, delivery.deliveryMethod, delivery.deliveryAddress, delivery.deliveryNotes, fee, groupReference, clientRef]
      );
      const orderRow = rows[0];
      await addOrderEvent({
        client,
        orderId: orderRow.id,
        actorId: req.user.id,
        actorRole: "buyer",
        eventType: "placed",
        label: "Order placed",
        note: `${safeQuantity} kg · ${productRow.name || "Product"} · ${DELIVERY_METHOD_LABEL[delivery.deliveryMethod]}`,
      });
      return { ...orderRow, farmerId: productRow.farmer_id, productName: productRow.name || "Product" };
    });

    const farmerId = order.farmerId;
    const productName = order.productName || "Product";

    emitOrderChanged(order.id, req.user.id, farmerId);
    if (farmerId) {
      notifyFarmerOfNewOrder({
        orderId: order.id,
        farmerId,
        buyerName: await getUserDisplayName(req.user.id),
        productName,
        quantity: safeQuantity,
      });
    }

    return res.status(201).json({ order });
  })
);

// ── Buyer's orders ─────────────────────────────────────────────────
// GET /api/orders/buyer
router.get(
  "/buyer",
  asyncHandler(async (req, res) => {
    const { rows } = await query(`${ORDER_SELECT} WHERE o.buyer_id = $1 ORDER BY o.created_at DESC`, [req.user.id]);
    const orders = await attachMeta(rows.map(shapeOrderRow));
    return res.json({ orders });
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
        "SELECT id, full_name, location FROM users WHERE id = ANY($1::uuid[])",
        [buyerIds]
      );
      buyerRows.forEach((b) => buyerNames.set(String(b.id), b));
    }

    const shaped = orders.map((order) => ({
      ...order,
      buyer: getProfileName(buyerNames.get(String(order.buyer)), "Buyer"),
      buyer_location: buyerNames.get(String(order.buyer))?.location || "",
    }));

    const withMeta = await attachMeta(shaped);
    return res.json({ orders: withMeta });
  })
);

// ── Update order status (farmer accept / reject / prepare / dispatch) ─
// PATCH /api/orders/:id/status  body: { status }
// Strict, server-enforced lifecycle:
//   pending → accepted | rejected
//   accepted → preparing (stock is reserved at acceptance)
//   preparing → ready_for_delivery
//   ready_for_delivery → dispatched (requires verified payment)
//   accepted → dispatched is still allowed for legacy orders.
// The stock decrement happens exactly once, atomically, at acceptance.
const FARMER_TRANSITIONS = {
  accepted: { from: ["pending"], timestamp: "accepted_at", label: "Farmer accepted the order", note: (o) => `${o.quantity} kg reserved from stock` },
  rejected: { from: ["pending"], label: "Farmer declined the order", note: () => "" },
  preparing: { from: ["accepted"], timestamp: "preparing_at", label: "Farmer started preparing", note: (o) => `${o.quantity} kg being prepared` },
  ready_for_delivery: { from: ["preparing"], timestamp: "ready_at", label: "Order ready for delivery", note: () => "Preparation complete — waiting to dispatch" },
  dispatched: {
    from: ["ready_for_delivery", "accepted"],
    timestamp: "dispatched_at",
    label: "Order sent out for delivery",
    note: () => "Handed to delivery / ready for pickup",
  },
};

router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const orderId = normalizeText(req.params.id);
    const cleanStatus = normalizeText(req.body.status).toLowerCase();

    if (!orderId) return res.status(400).json({ message: "Missing order id." });
    const transition = FARMER_TRANSITIONS[cleanStatus];
    if (!transition) {
      return res.status(400).json({ message: "Invalid order status update." });
    }

    const { rows } = await query(
      "SELECT id, buyer_id, product_id, quantity, status FROM orders WHERE id = $1",
      [orderId]
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ message: "Order not found." });

    const { rows: productRows } = await query("SELECT farmer_id, name, quantity FROM products WHERE id = $1", [order.product_id]);
    const product = productRows[0];
    if (!product) return res.status(404).json({ message: "Product not found for this order." });
    if (String(product.farmer_id) !== String(req.user.id)) {
      return res.status(403).json({ message: "You do not have permission to update this order." });
    }

    // Reject impossible transitions outright (controlled lifecycle).
    if (!transition.from.includes(order.status)) {
      const fromLabel = ORDER_STATUS_LABEL[order.status] || order.status;
      const toLabel = ORDER_STATUS_LABEL[cleanStatus] || cleanStatus;
      return res.status(400).json({
        message: `A ${fromLabel.toLowerCase()} order cannot move to ${toLabel.toLowerCase()} — the allowed step is ${transition.from
          .map((s) => (ORDER_STATUS_LABEL[s] || s).toLowerCase())
          .join(" or ")}.`,
      });
    }

    if (cleanStatus === "accepted" && Number(product.quantity || 0) < Number(order.quantity || 1)) {
      return res.status(400).json({
        message: `Not enough stock — only ${product.quantity} kg available for ${order.quantity} kg ordered.`,
      });
    }

    if (cleanStatus === "dispatched") {
      // The order must be paid before the farmer ships it (keeps the
      // paid-before-delivered lifecycle consistent for every order).
      const { rows: paidRows } = await query(
        `SELECT 1 FROM payments WHERE status IN ('succeeded', 'awaiting_settlement', 'settled', 'partially_refunded') AND order_ids ?| $1::text[] LIMIT 1`,
        [[String(orderId)]]
      );
      if (!paidRows.length) {
        return res.status(400).json({ message: "This order is not paid yet — wait for the buyer to pay before dispatching." });
      }
    }

    await withTransaction(async (client) => {
      const timestampColumn = transition.timestamp;
      const setClause = timestampColumn
        ? `UPDATE orders SET status = $1, ${timestampColumn} = now() WHERE id = $2 AND status = $3`
        : "UPDATE orders SET status = $1 WHERE id = $2 AND status = $3";
      const { rowCount } = await client.query(setClause, [cleanStatus, orderId, order.status]);
      if (!rowCount) {
        throw new Error("The order status changed — please refresh and try again.");
      }
      if (cleanStatus === "accepted") {
        // Reserve the ordered quantity from the farmer's stock. The
        // guarded UPDATE makes concurrent acceptances safe (no oversell).
        const { rowCount: stockCount } = await client.query(
          `UPDATE products SET quantity = quantity - $1 WHERE id = $2 AND quantity >= $1`,
          [Number(order.quantity || 1), order.product_id]
        );
        if (!stockCount) {
          throw new Error("Stock changed while accepting — please try again.");
        }
      }
      await addOrderEvent({
        client,
        orderId,
        actorId: req.user.id,
        actorRole: "farmer",
        eventType: cleanStatus,
        label: transition.label,
        note: transition.note(order),
      });
    });

    const fullOrder = await findOrder(orderId);
    emitOrderChanged(orderId, fullOrder?.buyer_id, req.user.id);

    const farmerName = await getUserDisplayName(req.user.id);
    const notificationForBuyer = {
      accepted: { title: "Order accepted", body: `${farmerName} accepted your order for ${order.quantity} kg of ${product.name}.` },
      preparing: { title: "Order being prepared", body: `${farmerName} started preparing your order for ${order.quantity} kg of ${product.name}.` },
      ready_for_delivery: { title: "Order ready for delivery", body: `${farmerName} finished preparing ${order.quantity} kg of ${product.name} — dispatch is next.` },
      dispatched: { title: "Order out for delivery", body: `${farmerName} dispatched your order for ${order.quantity} kg of ${product.name}. It's on the way!` },
      rejected: { title: "Order declined", body: `${farmerName} declined your order for ${order.quantity} kg of ${product.name}.` },
    }[cleanStatus];
    if (notificationForBuyer) {
      await createNotification({
        userId: fullOrder?.buyer_id,
        type: "order",
        title: notificationForBuyer.title,
        body: notificationForBuyer.body,
        link: "/buyer/orders",
      });
    }

    return res.json({ message: `Order ${ORDER_STATUS_LABEL[cleanStatus] || "updated"}.` });
  })
);

// ── Buyer cancels a pending order ──────────────────────────────────
// POST /api/orders/:id/cancel  body: { reason? }
router.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const orderId = normalizeText(req.params.id);
    const reason = normalizeText(req.body.reason).slice(0, 300);

    if (!orderId) return res.status(400).json({ message: "Missing order id." });

    const { rows } = await query(
      "SELECT id, buyer_id, product_id, quantity, status FROM orders WHERE id = $1",
      [orderId]
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (String(order.buyer_id) !== String(req.user.id)) {
      return res.status(403).json({ message: "Only the buyer who placed this order can cancel it." });
    }
    if (order.status !== "pending") {
      return res.status(400).json({ message: "Only pending orders can be cancelled." });
    }

    const { rows: productRows } = await query("SELECT farmer_id, name FROM products WHERE id = $1", [order.product_id]);
    const farmerId = productRows[0]?.farmer_id || null;

    await query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [orderId]);
    await addOrderEvent({
      orderId,
      actorId: req.user.id,
      actorRole: "buyer",
      eventType: "cancelled",
      label: "Order cancelled",
      note: reason || "Cancelled by the buyer",
    });

    emitOrderChanged(orderId, req.user.id, farmerId);
    if (farmerId) {
      await createNotification({
        userId: farmerId,
        type: "order",
        title: "Order cancelled",
        body: `A buyer cancelled their order for ${order.quantity} kg of ${productRows[0]?.name || "your product"}.`,
        link: "/farmer/orders",
      });
    }

    return res.json({ message: "Order cancelled." });
  })
);

// ── Refund a paid order ────────────────────────────────────────────
// POST /api/orders/:id/refund  body: { reason? }
// Allowed for the buyer who owns the order (paid, not yet completed) or
// an admin (any paid order). Restores stock, reverses the covering
// payment(s), writes a refund ledger row and never deletes anything —
// the full transaction history is preserved.
router.post(
  "/:id/refund",
  asyncHandler(async (req, res) => {
    const orderId = normalizeText(req.params.id);
    const reason = normalizeText(req.body.reason).slice(0, 300);
    if (!orderId) return res.status(400).json({ message: "Missing order id." });

    const { rows } = await query(
      "SELECT id, buyer_id, product_id, quantity, status, delivery_fee FROM orders WHERE id = $1",
      [orderId]
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ message: "Order not found." });

    const isAdmin = String(req.user.role || "").split("_")[0] === "admin";
    if (!isAdmin && String(order.buyer_id) !== String(req.user.id)) {
      return res.status(403).json({ message: "Only the buyer who placed this order (or an admin) can refund it." });
    }
    if (order.status === "refunded") {
      return res.status(400).json({ message: "This order was already refunded." });
    }
    if (order.status === "pending" || order.status === "rejected" || order.status === "cancelled") {
      return res.status(400).json({ message: "This order was never paid, so there is nothing to refund." });
    }
    if (!isAdmin && order.status === "completed") {
      return res.status(400).json({ message: "This order is already completed — contact support for a refund." });
    }

    await withTransaction(async (client) => {
      const { rows: productRows } = await client.query(
        "SELECT id, farmer_id, name, price, quantity FROM products WHERE id = $1 FOR UPDATE",
        [order.product_id]
      );
      const productRow = productRows[0];
      if (!productRow) {
        throw Object.assign(new Error("Could not find the product for this order."), { status: 404 });
      }

      // Lock the covering payment(s) so a concurrent webhook can't double-charge.
      const { rows: paymentRows } = await client.query(
        `SELECT id, provider, provider_payment_id, amount_cents, order_ids
         FROM payments
         WHERE status IN ('succeeded', 'awaiting_settlement', 'settled', 'partially_refunded') AND order_ids ?| $1::text[]
         FOR UPDATE`,
        [[String(orderId)]]
      );
      if (!paymentRows.length) {
        throw Object.assign(new Error("This order has no verified payment to refund."), { status: 400 });
      }

      // Restore the reserved stock.
      await client.query(
        `UPDATE products SET quantity = quantity + $1 WHERE id = $2`,
        [Number(order.quantity || 1), order.product_id]
      );

      await client.query(
        `UPDATE orders SET status = 'refunded', completed_at = NULL WHERE id = $1`,
        [orderId]
      );

      const financials = computeFinancials({
        unitPrice: productRow.price,
        quantity: Number(order.quantity || 1),
        deliveryFee: order.delivery_fee,
      });
      const refundRef = genRef("REF");
      await addOrderEvent({
        client,
        orderId,
        actorId: req.user.id,
        actorRole: isAdmin ? "admin" : "buyer",
        eventType: "refunded",
        label: "Order refunded",
        note: reason || "Refunded by the buyer",
      });

      for (const payment of paymentRows) {
        // Reverse the buyer's money on the ledger (never delete the payment).
        await recordLedgerEntry({
          client,
          reference: `${refundRef}-${String(payment.id).slice(0, 8)}`,
          orderId,
          paymentId: payment.id,
          buyerId: req.user.id,
          farmerId: productRow.farmer_id,
          provider: payment.provider,
          providerReference: payment.provider_payment_id || "",
          transactionType: "refund",
          amountCents: financials.totalCents,
          meta: { reason: reason || "buyer refund" },
        });

        // If every covered order is now dead, the payment is fully refunded;
        // otherwise it is partially refunded.
        const covered = Array.isArray(payment.order_ids) ? payment.order_ids.map(String) : [];
        if (covered.length) {
          const { rows: statusRows } = await client.query(
            `SELECT id FROM orders
             WHERE id = ANY($1::uuid[])
               AND status NOT IN ('refunded', 'cancelled', 'rejected')`,
            [covered]
          );
          const newStatus = statusRows.length === 0 ? "refunded" : "partially_refunded";
          await client.query(
            `UPDATE payments SET status = $2, updated_at = now() WHERE id = $1`,
            [payment.id, newStatus]
          );
        }
      }

      // Reverse any settlement that was already created (admin refund of a
      // completed order) — the payout must never stand after a refund.
      await client.query(
        `UPDATE settlements SET status = 'failed', updated_at = now() WHERE order_id = $1 AND status <> 'settled'`,
        [orderId]
      );
    });

    const { rows: notifyRows } = await query("SELECT farmer_id FROM products WHERE id = $1", [order.product_id]);
    const farmerId = notifyRows[0]?.farmer_id || null;
    emitOrderChanged(orderId, order.buyer_id, farmerId);
    if (farmerId) {
      await createNotification({
        userId: farmerId,
        type: "payment",
        title: "Order refunded",
        body: `A paid order for ${order.quantity} kg was refunded — stock was restored.`,
        link: "/farmer/orders",
      });
    }

    return res.json({ message: "Order refunded. The buyer's money will be returned and stock restored." });
  })
);

// ── Buyer confirms delivery ────────────────────────────────────────
// POST /api/orders/:id/confirm-delivery
router.post(
  "/:id/confirm-delivery",
  asyncHandler(async (req, res) => {
    const orderId = normalizeText(req.params.id);
    if (!orderId) return res.status(400).json({ message: "Missing order id." });

    const { rows } = await query("SELECT id, product_id, buyer_id, status FROM orders WHERE id = $1", [orderId]);
    const order = rows[0];
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (String(order.buyer_id) !== String(req.user.id)) {
      return res.status(403).json({ message: "Only the buyer can confirm delivery." });
    }
    if (order.status === "delivered" || order.status === "completed") {
      return res.status(400).json({ message: "Delivery was already confirmed for this order." });
    }
    // The farmer must send the order out before the buyer can confirm receipt.
    if (order.status !== "dispatched") {
      return res.status(400).json({ message: "The order is not out for delivery yet — wait for the farmer to dispatch it." });
    }

    const { rows: productRows } = await query("SELECT farmer_id, name FROM products WHERE id = $1", [order.product_id]);
    const farmerId = productRows[0]?.farmer_id;
    if (!farmerId) return res.status(400).json({ message: "Could not find farmer for this order." });

    await query("UPDATE orders SET status = 'delivered', delivered_at = now() WHERE id = $1", [orderId]);

    const { rows: inserted } = await query(
      `INSERT INTO messages (order_id, sender_id, receiver_id, message)
       VALUES ($1, $2, $3, 'Buyer confirmed delivery')
       RETURNING id`,
      [orderId, req.user.id, farmerId]
    );

    await addOrderEvent({
      orderId,
      actorId: req.user.id,
      actorRole: "buyer",
      eventType: "delivered",
      label: "Delivery confirmed by the buyer",
      note: "Product received",
    });

    emitMessageNew({ orderId, senderId: req.user.id, receiverId: farmerId });
    emitOrderChanged(orderId, req.user.id, farmerId);
    if (farmerId) {
      await createNotification({
        userId: farmerId,
        type: "order",
        title: "Delivery confirmed",
        body: `The buyer confirmed delivery of ${productRows[0]?.name || "your product"}.`,
        link: "/farmer/orders",
      });
    }

    return res.status(201).json({ message: "Delivery confirmed.", messageId: inserted[0]?.id });
  })
);

// ── Buyer marks a delivered order as completed ─────────────────────
// POST /api/orders/:id/complete
// Marks the order completed, records the delivery confirmation audit
// trail, and — in the same transaction — creates the farmer's settlement
// (eligible) plus the ledger rows, so money can never be lost.
router.post(
  "/:id/complete",
  asyncHandler(async (req, res) => {
    const orderId = normalizeText(req.params.id);
    if (!orderId) return res.status(400).json({ message: "Missing order id." });

    const { rows } = await query("SELECT id, product_id, buyer_id, quantity, status, delivery_fee FROM orders WHERE id = $1", [orderId]);
    const order = rows[0];
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (String(order.buyer_id) !== String(req.user.id)) {
      return res.status(403).json({ message: "Only the buyer can complete this order." });
    }
    if (order.status !== "delivered") {
      return res.status(400).json({ message: "Only delivered orders can be marked as completed." });
    }

    const result = await withTransaction(async (client) => {
      const { rows: productRows } = await client.query(
        "SELECT id, farmer_id, name, price FROM products WHERE id = $1 FOR UPDATE",
        [order.product_id]
      );
      const productRow = productRows[0];
      if (!productRow) {
        throw Object.assign(new Error("Could not find the product for this order."), { status: 404 });
      }
      const farmerId = productRow.farmer_id;

      const { rowCount } = await client.query(
        `UPDATE orders SET status = 'completed', completed_at = now(), confirmed_at = now(), confirmed_by = $2
         WHERE id = $1 AND status = 'delivered'`,
        [orderId, req.user.id]
      );
      if (!rowCount) {
        throw new Error("The order status changed — please refresh and try again.");
      }

      await addOrderEvent({
        client,
        orderId,
        actorId: req.user.id,
        actorRole: "buyer",
        eventType: "completed",
        label: "Order completed",
        note: "Thank you! This order is now finished.",
      });

      // Farmer settlement becomes eligible now that fulfillment is done.
      const financials = computeFinancials({
        unitPrice: productRow.price,
        quantity: Number(order.quantity || 1),
        deliveryFee: order.delivery_fee,
      });
      const settlementRef = genRef("STL");
      await createSettlementForOrder({
        client,
        orderId,
        farmerId,
        buyerId: req.user.id,
        financials,
        reference: settlementRef,
      });

      // Permanent audit trail: settlement + platform fee retention.
      await recordLedgerEntry({
        client,
        reference: settlementRef,
        orderId,
        buyerId: req.user.id,
        farmerId,
        transactionType: "settlement",
        amountCents: financials.productCents + financials.deliveryCents,
        meta: { platformFeeCents: financials.platformCents, settlementRef },
      });
      await recordLedgerEntry({
        client,
        reference: genRef("FEE"),
        orderId,
        buyerId: req.user.id,
        farmerId,
        transactionType: "platform_fee",
        amountCents: financials.platformCents,
        meta: { percent: PLATFORM_FEE_PERCENT },
      });

      // The covering payment now awaits settlement processing.
      const { rows: paymentRows } = await client.query(
        `SELECT id FROM payments WHERE status IN ('succeeded', 'awaiting_settlement') AND order_ids ?| $1::text[]`,
        [[String(orderId)]]
      );
      for (const payment of paymentRows) {
        await syncPaymentSettlementStatus(client, payment.id);
      }

      return { farmerId, productName: productRow.name || "your product" };
    });

    emitOrderChanged(orderId, req.user.id, result.farmerId);
    if (result.farmerId) {
      await createNotification({
        userId: result.farmerId,
        type: "order",
        title: "Order completed — settlement eligible",
        body: `A buyer completed their order for ${result.productName}. Your settlement is now eligible.`,
        link: "/farmer/orders",
      });
    }

    return res.json({ message: "Order completed. The farmer's settlement is now eligible." });
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

    await addOrderEvent({
      orderId,
      actorId: req.user.id,
      actorRole: "buyer",
      eventType: "issue_reported",
      label: "Issue reported",
      note: issue.slice(0, 300),
    });

    emitMessageNew({ orderId, senderId: req.user.id, receiverId: farmerId });
    emitOrderChanged(orderId, req.user.id, farmerId);

    return res.status(201).json({ message: "Issue reported." });
  })
);

export default router;
