import { Router } from "express";
import { query, withTransaction } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";

const router = Router();
router.use(requireAuth);

const PAYMENT_METHODS = ["cash", "mobile_money", "bank_transfer"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PAYMENT_COLUMNS = `id, buyer_id, order_ids, order_count, provider, provider_payment_id,
  amount_cents, currency, status, batch_reference, raw_response, created_at, updated_at`;

const toSafePayment = (row) => ({
  id: row.id,
  buyerId: row.buyer_id,
  orderIds: Array.isArray(row.order_ids) ? row.order_ids : [],
  orderCount: Number(row.order_count || 0),
  provider: row.provider,
  providerPaymentId: row.provider_payment_id,
  amountCents: Number(row.amount_cents || 0),
  currency: row.currency || "ETB",
  status: row.status,
  batchReference: row.batch_reference,
  createdAt: row.created_at,
});

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

// ── Payment status for the current buyer ───────────────────────────
// GET /api/payments/status
// Returns every succeeded payment the buyer has made plus helpers that
// tell the client which of their orders are already covered.
router.get(
  "/status",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT ${PAYMENT_COLUMNS}
       FROM payments
       WHERE buyer_id = $1 AND status = 'succeeded'
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    const payments = rows.map(toSafePayment);
    const paidByOrder = new Map();
    const paidOrderIds = [];

    payments.forEach((payment) => {
      payment.orderIds.forEach((orderId) => {
        const key = String(orderId);
        if (!paidByOrder.has(key)) {
          paidByOrder.set(key, payment);
          paidOrderIds.push(key);
        }
      });
    });

    return res.json({
      payments,
      paidOrderIds,
      paidByOrder: Object.fromEntries(paidByOrder),
    });
  })
);

// ── Pay a batch of accepted orders (simulated) ─────────────────────
// POST /api/payments/from-orders
// body: { orderIds: string[], method: 'cash'|'mobile_money'|'bank_transfer', cardLast4? }
router.post(
  "/from-orders",
  asyncHandler(async (req, res) => {
    const rawOrderIds = Array.isArray(req.body.orderIds) ? req.body.orderIds.map(String) : [];
    const orderIds = rawOrderIds.filter((id) => UUID_RE.test(id));

    const method = String(req.body.method || "cash").toLowerCase();
    const cardLast4 = String(req.body.cardLast4 || "").replace(/\D/g, "").slice(-4);

    if (!rawOrderIds.length) {
      return res.status(400).json({ message: "No orders selected for payment." });
    }
    if (!orderIds.length) {
      return res.status(400).json({ message: "Invalid order id format." });
    }
    if (!PAYMENT_METHODS.includes(method)) {
      return res.status(400).json({ message: "Invalid payment method." });
    }

    const inserted = await withTransaction(async (client) => {
      // Lock the buyer's order rows so two concurrent batch payments
      // cannot both succeed for the same orders.
      const { rows: orderRows } = await client.query(
        `SELECT o.id, o.quantity, o.status, p.price AS unit_price
         FROM orders o
         JOIN products p ON p.id = o.product_id
         WHERE o.buyer_id = $1 AND o.id = ANY($2::uuid[])
         FOR UPDATE OF o`,
        [req.user.id, orderIds]
      );

      if (!orderRows.length) {
        fail(404, "No payable orders were found.");
      }

      // Skip orders already covered by an earlier succeeded payment.
      const { rows: existingPayments } = await client.query(
        `SELECT order_ids FROM payments WHERE buyer_id = $1 AND status = 'succeeded'`,
        [req.user.id]
      );
      const paidOrderSet = new Set();
      existingPayments.forEach((row) => {
        (Array.isArray(row.order_ids) ? row.order_ids : []).forEach((id) => paidOrderSet.add(String(id)));
      });

      const payableOrders = orderRows.filter(
        (order) => order.status === "accepted" && !paidOrderSet.has(String(order.id))
      );

      if (!payableOrders.length) {
        const anyAccepted = orderRows.some((order) => order.status === "accepted");
        fail(
          400,
          anyAccepted ? "These orders have already been paid." : "Only accepted orders can be paid."
        );
      }

      const amountTotal = payableOrders.reduce(
        (sum, order) => sum + Number(order.quantity || 0) * Number(order.unit_price || 0),
        0
      );
      const amountCents = Math.round(amountTotal * 100);
      const batchReference = `PAY-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const providerPaymentId = `SIM-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

      const { rows } = await client.query(
        `INSERT INTO payments
           (buyer_id, order_ids, order_count, provider, provider_payment_id,
            amount_cents, currency, status, batch_reference, raw_response)
         VALUES ($1, $2::jsonb, $3, $4, $5, $6, 'ETB', 'succeeded', $7, $8)
         RETURNING ${PAYMENT_COLUMNS}`,
        [
          req.user.id,
          JSON.stringify(payableOrders.map((order) => order.id)),
          payableOrders.length,
          method,
          providerPaymentId,
          amountCents,
          batchReference,
          JSON.stringify({ method, cardLast4, simulated: true }),
        ]
      );
      return rows[0];
    });

    const payment = toSafePayment(inserted);

    return res.status(201).json({
      message: "Payment successful.",
      payment,
      paidOrderIds: payment.orderIds.map((id) => String(id)),
    });
  })
);

export default router;
