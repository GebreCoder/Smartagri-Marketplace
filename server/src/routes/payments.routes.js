import { Router } from "express";
import { query, withTransaction } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { config } from "../config.js";
import {
  isChapaConfigured,
  initializeChapaPayment,
  verifyChapaPayment,
  isChapaSuccess,
  isChapaTerminalFailure,
  verifyChapaWebhookSignature,
} from "../services/chapa.js";

const router = Router();

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

/**
 * Lock the buyer's order rows, drop anything already covered by a
 * succeeded payment, and return the accepted, still-unpaid orders.
 * Runs inside the caller's transaction.
 */
async function loadPayableOrders(client, buyerId, orderIds) {
  const { rows: orderRows } = await client.query(
    `SELECT o.id, o.quantity, o.status, p.price AS unit_price
     FROM orders o
     JOIN products p ON p.id = o.product_id
     WHERE o.buyer_id = $1 AND o.id = ANY($2::uuid[])
     FOR UPDATE OF o`,
    [buyerId, orderIds]
  );

  if (!orderRows.length) {
    fail(404, "No payable orders were found.");
  }

  const { rows: existingPayments } = await client.query(
    `SELECT order_ids FROM payments WHERE buyer_id = $1 AND status = 'succeeded'`,
    [buyerId]
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

  return { payableOrders, amountTotal, amountCents: Math.round(amountTotal * 100) };
}

// ── Chapa webhook (PUBLIC — registered before requireAuth) ──────────
// POST /api/payments/chapa/webhook
// Chapa calls this after a payment event. We verify the HMAC-SHA256
// signature (configured in the Chapa dashboard), then re-confirm the
// final state with Chapa before marking the payment as succeeded.
router.post(
  "/chapa/webhook",
  asyncHandler(async (req, res) => {
    const signature = req.headers["chapa-signature"] || req.headers["x-chapa-signature"] || "";
    if (!verifyChapaWebhookSignature(req.rawBody || "", signature)) {
      return res.status(401).json({ message: "Invalid webhook signature." });
    }

    const txRef = String(req.body?.tx_ref || req.body?.trx_ref || "");
    if (txRef && isChapaConfigured()) {
      const { rows } = await query(
        `SELECT id FROM payments WHERE provider_payment_id = $1 AND provider = 'chapa'`,
        [txRef]
      );
      if (rows.length) {
        try {
          const verification = await verifyChapaPayment(txRef);
          if (isChapaSuccess(verification)) {
            await query(
              `UPDATE payments SET status = 'succeeded', raw_response = $2 WHERE id = $1`,
              [rows[0].id, JSON.stringify(verification)]
            );
          }
        } catch (error) {
          // Never let an outbound verification failure break the webhook
          // acknowledgement — Chapa would retry otherwise.
          console.error("[chapa] webhook verify failed:", error.message);
        }
      }
    }

    return res.status(200).json({ received: true });
  })
);

// Everything below requires a signed-in user.
router.use(requireAuth);

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
      chapaEnabled: isChapaConfigured(),
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
      const { payableOrders, amountCents } = await loadPayableOrders(client, req.user.id, orderIds);

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

// ── Start a Chapa hosted checkout for the accepted batch ───────────
// POST /api/payments/chapa/initialize
// body: { orderIds: string[], phoneNumber?, firstName?, lastName? }
// Creates a 'pending' payment row, asks Chapa for a checkout_url, and
// returns it so the client can redirect the buyer.
router.post(
  "/chapa/initialize",
  asyncHandler(async (req, res) => {
    if (!isChapaConfigured()) {
      return res.status(400).json({
        message: "Chapa is not configured on this server. Simulated payment is still available.",
      });
    }

    const rawOrderIds = Array.isArray(req.body.orderIds) ? req.body.orderIds.map(String) : [];
    const orderIds = rawOrderIds.filter((id) => UUID_RE.test(id));

    if (!rawOrderIds.length) {
      return res.status(400).json({ message: "No orders selected for payment." });
    }
    if (!orderIds.length) {
      return res.status(400).json({ message: "Invalid order id format." });
    }

    const { payment, amountCents } = await withTransaction(async (client) => {
      const { payableOrders, amountCents } = await loadPayableOrders(client, req.user.id, orderIds);

      const txRef = `AGRI-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      // Close any earlier checkouts this buyer abandoned (they never block
      // payment — only 'succeeded' rows do — but they would accumulate).
      await client.query(
        `UPDATE payments SET status = 'failed', raw_response = $2
         WHERE buyer_id = $1 AND provider = 'chapa' AND status = 'pending'`,
        [req.user.id, JSON.stringify({ abandoned: true, note: "Superseded by a new checkout attempt." })]
      );

      const { rows } = await client.query(
        `INSERT INTO payments
           (buyer_id, order_ids, order_count, provider, provider_payment_id,
            amount_cents, currency, status, batch_reference, raw_response)
         VALUES ($1, $2::jsonb, $3, 'chapa', $4, $5, 'ETB', 'pending', $4, $6)
         RETURNING ${PAYMENT_COLUMNS}`,
        [
          req.user.id,
          JSON.stringify(payableOrders.map((order) => order.id)),
          payableOrders.length,
          txRef,
          amountCents,
          JSON.stringify({ method: "chapa", pending: true }),
        ]
      );
      return { payment: rows[0], amountCents };
    });

    let checkout;
    try {
      checkout = await initializeChapaPayment({
        amountEtb: amountCents / 100,
        txRef: payment.provider_payment_id,
        email: req.user.email,
        firstName: String(req.body.firstName || "").slice(0, 50),
        lastName: String(req.body.lastName || "").slice(0, 50),
        phoneNumber: String(req.body.phoneNumber || "").slice(0, 20),
        callbackUrl: `${config.publicUrl}/api/payments/chapa/webhook`,
        returnUrl: `${config.publicUrl}/buyer/orders`,
      });
    } catch (error) {
      await query(
        `UPDATE payments SET status = 'failed', raw_response = $2 WHERE id = $1`,
        [payment.id, JSON.stringify({ error: error.message })]
      );
      throw error;
    }

    await query(
      `UPDATE payments SET raw_response = $2 WHERE id = $1`,
      [payment.id, JSON.stringify({ checkoutUrl: checkout.checkout_url, method: "chapa" })]
    );

    return res.status(201).json({
      message: "Payment initiated with Chapa.",
      checkoutUrl: checkout.checkout_url,
      txRef: payment.provider_payment_id,
      payment: toSafePayment({ ...payment, status: "pending" }),
    });
  })
);

// ── Confirm a Chapa payment (server-side verify) ───────────────────
// POST /api/payments/chapa/verify  body: { txRef }
// Called from the client after the buyer returns from Chapa (and also
// polled automatically). Final authority is Chapa's verify endpoint.
router.post(
  "/chapa/verify",
  asyncHandler(async (req, res) => {
    if (!isChapaConfigured()) {
      return res.status(400).json({ message: "Chapa is not configured on this server." });
    }
    const txRef = String(req.body.txRef || "");
    if (!txRef) return res.status(400).json({ message: "Missing transaction reference." });

    const { rows } = await query(
      `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE buyer_id = $1 AND provider_payment_id = $2 AND provider = 'chapa'`,
      [req.user.id, txRef]
    );
    if (!rows.length) return res.status(404).json({ message: "Payment not found." });

    const payment = rows[0];
    if (payment.status === "succeeded") {
      return res.json({ message: "Payment already verified.", payment: toSafePayment(payment) });
    }

    const verification = await verifyChapaPayment(txRef);
    const success = isChapaSuccess(verification);
    const terminalFailure = isChapaTerminalFailure(verification);
    // Only a confirmed terminal failure marks the row failed; an
    // inconclusive state (still pending at Chapa, network blip) stays
    // 'pending' so the client's polling can retry cleanly.
    const newStatus = success ? "succeeded" : terminalFailure ? "failed" : "pending";
    const { rows: updated } = await query(
      `UPDATE payments SET status = $2, raw_response = $3 WHERE id = $1 RETURNING ${PAYMENT_COLUMNS}`,
      [payment.id, newStatus, JSON.stringify(verification)]
    );

    return res.json({
      message:
        success ? "Payment verified."
        : terminalFailure ? "Payment failed."
        : "Payment is not completed yet.",
      payment: toSafePayment(updated[0]),
    });
  })
);

export default router;
