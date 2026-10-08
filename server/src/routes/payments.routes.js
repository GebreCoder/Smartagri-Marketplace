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
import { addOrderEvent, createNotification } from "../services/notifications.js";
import { emitOrderChanged } from "../socket.js";
import {
  centsToEtb,
  computeFinancials,
  genRef,
  PLATFORM_FEE_PERCENT,
  recordLedgerEntry,
} from "../services/finance.js";

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
 * After a payment row is marked succeeded, record a 'paid' timeline event
 * on every covered order, write the financial ledger rows, and notify
 * the buyer + the involved farmers. Only call this when the payment
 * actually transitions to succeeded (never on a duplicate callback).
 */
const recordPaymentSuccess = async (payment) => {
  const orderIds = (payment.orderIds || []).filter(Boolean);
  if (!orderIds.length) return;

  const { rows: orderRows } = await query(
    `SELECT o.id, o.buyer_id, o.quantity, o.delivery_fee, p.farmer_id, p.name AS product_name, p.price AS unit_price
     FROM orders o
     JOIN products p ON p.id = o.product_id
     WHERE o.id = ANY($1::uuid[])`,
    [orderIds]
  );

  for (const order of orderRows) {
    await addOrderEvent({
      orderId: order.id,
      actorId: payment.buyerId,
      actorRole: "buyer",
      eventType: "paid",
      label: "Payment received",
      note: `${Number(order.quantity || 0)} kg · ${order.product_name || "Product"}`,
    });

    // Permanent audit trail: what the buyer paid for this order and what
    // the platform retained as a service fee.
    const financials = computeFinancials({
      unitPrice: order.unit_price,
      quantity: order.quantity,
      deliveryFee: order.delivery_fee,
    });
    await recordLedgerEntry({
      reference: genRef("PAY"),
      orderId: order.id,
      paymentId: payment.id,
      buyerId: payment.buyerId,
      farmerId: order.farmer_id,
      provider: payment.provider,
      providerReference: payment.providerPaymentId || "",
      transactionType: "payment",
      amountCents: financials.totalCents,
      meta: {
        method: payment.provider,
        subtotalCents: financials.productCents,
        deliveryFeeCents: financials.deliveryCents,
        platformFeeCents: financials.platformCents,
      },
    });
    await recordLedgerEntry({
      reference: genRef("FEE"),
      orderId: order.id,
      paymentId: payment.id,
      buyerId: payment.buyerId,
      farmerId: order.farmer_id,
      provider: payment.provider,
      providerReference: payment.providerPaymentId || "",
      transactionType: "platform_fee",
      amountCents: financials.platformCents,
      meta: { percent: PLATFORM_FEE_PERCENT },
    });
  }

  const paidAmount = `ETB ${(Number(payment.amountCents || 0) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  await createNotification({
    userId: payment.buyerId,
    type: "payment",
    title: "Payment successful",
    body: `You paid ${paidAmount} for ${orderRows.length} order${orderRows.length === 1 ? "" : "s"}.`,
    link: "/buyer/orders",
  });

  const farmerIds = [...new Set(orderRows.map((o) => o.farmer_id).filter(Boolean))];
  for (const farmerId of farmerIds) {
    const count = orderRows.filter((o) => String(o.farmer_id) === String(farmerId)).length;
    await createNotification({
      userId: farmerId,
      type: "payment",
      title: "Order paid",
      body: `A buyer paid for ${count} of your order${count === 1 ? "" : "s"}.`,
      link: "/farmer/orders",
    });
  }

  // Refresh both sides in realtime so the paid badge and the farmer's
  // "Dispatch" action appear immediately (buyer + every involved farmer).
  for (const order of orderRows) {
    emitOrderChanged(order.id, payment.buyerId, order.farmer_id);
  }
};

/**
 * Lock the buyer's order rows, drop anything already covered by a
 * succeeded payment, and return the accepted, still-unpaid orders with
 * the full backend-calculated price breakdown (subtotal, delivery fee,
 * platform fee, total). Runs inside the caller's transaction.
 */
async function loadPayableOrders(client, buyerId, orderIds) {
  const { rows: orderRows } = await client.query(
    `SELECT o.id, o.quantity, o.status, o.delivery_fee, p.price AS unit_price, p.farmer_id
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
    `SELECT order_ids FROM payments WHERE buyer_id = $1 AND status IN ('succeeded', 'awaiting_settlement', 'settled')`,
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

  // Prices, quantities and fees are always re-read from the database — the
  // frontend never supplies financial values (spec: price validation).
  const perOrder = payableOrders.map((order) => {
    const financials = computeFinancials({
      unitPrice: order.unit_price,
      quantity: order.quantity,
      deliveryFee: order.delivery_fee,
    });
    return { orderId: order.id, farmerId: order.farmer_id, ...financials };
  });

  const breakdown = {
    subtotalCents: perOrder.reduce((sum, line) => sum + line.productCents, 0),
    deliveryFeeCents: perOrder.reduce((sum, line) => sum + line.deliveryCents, 0),
    platformFeeCents: perOrder.reduce((sum, line) => sum + line.platformCents, 0),
    totalCents: perOrder.reduce((sum, line) => sum + line.totalCents, 0),
    platformFeePercent: PLATFORM_FEE_PERCENT,
    perOrder,
  };

  return { payableOrders, breakdown, amountCents: breakdown.totalCents };
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
        `SELECT id, status FROM payments WHERE provider_payment_id = $1 AND provider = 'chapa'`,
        [txRef]
      );
      const paymentRow = rows[0];
      // Idempotency: duplicate callbacks must never re-record a success.
      if (paymentRow && paymentRow.status !== "succeeded") {
        try {
          const verification = await verifyChapaPayment(txRef);
          if (isChapaSuccess(verification)) {
            const { rowCount } = await query(
              `UPDATE payments SET status = 'succeeded', raw_response = $2
               WHERE id = $1 AND status <> 'succeeded'`,
              [paymentRow.id, JSON.stringify(verification)]
            );
            if (rowCount) {
              await recordPaymentSuccess(toSafePayment(paymentRow));
            }
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
       WHERE buyer_id = $1
         AND status IN ('succeeded', 'awaiting_settlement', 'settled', 'partially_refunded')
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
// body: { orderIds: string[], method: 'cash'|'mobile_money'|'bank_transfer',
//         cardLast4?, idempotencyKey? }
// The amount charged is always recomputed by the backend (price, quantity,
// delivery fee + platform fee). The same idempotencyKey never charges twice.
router.post(
  "/from-orders",
  asyncHandler(async (req, res) => {
    const rawOrderIds = Array.isArray(req.body.orderIds) ? req.body.orderIds.map(String) : [];
    const orderIds = rawOrderIds.filter((id) => UUID_RE.test(id));

    const method = String(req.body.method || "cash").toLowerCase();
    const cardLast4 = String(req.body.cardLast4 || "").replace(/\D/g, "").slice(-4);
    const idempotencyKey = String(req.body.idempotencyKey || "").trim().slice(0, 80);

    if (!rawOrderIds.length) {
      return res.status(400).json({ message: "No orders selected for payment." });
    }
    if (!orderIds.length) {
      return res.status(400).json({ message: "Invalid order id format." });
    }
    if (!PAYMENT_METHODS.includes(method)) {
      return res.status(400).json({ message: "Invalid payment method." });
    }

    // Idempotency: if the client retries the same key, return the original
    // payment instead of re-validating (the orders may already be paid).
    if (idempotencyKey) {
      const { rows: retried } = await query(
        `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE batch_reference = $1 AND buyer_id = $2`,
        [idempotencyKey, req.user.id]
      );
      if (retried[0]) {
        const payment = toSafePayment(retried[0]);
        return res.status(200).json({
          message: "This batch was already paid — no duplicate charge.",
          payment,
          paidOrderIds: payment.orderIds.map((id) => String(id)),
        });
      }
    }

    const { inserted, existing } = await withTransaction(async (client) => {
      const { payableOrders, breakdown, amountCents } = await loadPayableOrders(client, req.user.id, orderIds);

      // An idempotency key (or a deterministic reference from the batch) is
      // used as the unique batch_reference, so a retried request returns the
      // original payment instead of charging again.
      const batchReference =
        idempotencyKey ||
        `PAY-${orderIds.map((id) => id.slice(0, 8)).join("").slice(0, 24).toUpperCase()}`;
      const providerPaymentId = `SIM-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

      const { rows } = await client.query(
        `INSERT INTO payments
           (buyer_id, order_ids, order_count, provider, provider_payment_id,
            amount_cents, currency, status, batch_reference, raw_response)
         VALUES ($1, $2::jsonb, $3, $4, $5, $6, 'ETB', 'succeeded', $7, $8)
         ON CONFLICT (batch_reference) WHERE batch_reference <> '' DO NOTHING
         RETURNING ${PAYMENT_COLUMNS}`,
        [
          req.user.id,
          JSON.stringify(payableOrders.map((order) => order.id)),
          payableOrders.length,
          method,
          providerPaymentId,
          amountCents,
          batchReference,
          JSON.stringify({
            method,
            cardLast4,
            simulated: true,
            breakdown: {
              subtotalCents: breakdown.subtotalCents,
              deliveryFeeCents: breakdown.deliveryFeeCents,
              platformFeeCents: breakdown.platformFeeCents,
              totalCents: breakdown.totalCents,
            },
          }),
        ]
      );

      if (rows[0]) {
        return { inserted: rows[0], existing: null };
      }
      const { rows: existingRows } = await client.query(
        `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE batch_reference = $1 AND buyer_id = $2`,
        [batchReference, req.user.id]
      );
      return { inserted: null, existing: existingRows[0] || null };
    });

    if (existing) {
      const payment = toSafePayment(existing);
      return res.status(200).json({
        message: "This batch was already paid — no duplicate charge.",
        payment,
        paidOrderIds: payment.orderIds.map((id) => String(id)),
      });
    }

    const payment = toSafePayment(inserted);

    await recordPaymentSuccess(payment);

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
      const { payableOrders, breakdown, amountCents } = await loadPayableOrders(client, req.user.id, orderIds);

      const txRef = `AGRI-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      // Close any earlier checkouts this buyer abandoned (they never block
      // payment — only 'succeeded' rows do — but they would accumulate).
      await client.query(
        `UPDATE payments SET status = 'cancelled', raw_response = $2
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
          JSON.stringify({
            method: "chapa",
            pending: true,
            breakdown: {
              subtotalCents: breakdown.subtotalCents,
              deliveryFeeCents: breakdown.deliveryFeeCents,
              platformFeeCents: breakdown.platformFeeCents,
              totalCents: breakdown.totalCents,
            },
          }),
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

// ── Payment quote for the buyer's unpaid accepted batch ────────────
// GET /api/payments/quote
// Returns the backend-calculated breakdown the buyer will be charged:
// subtotal + delivery fee + platform fee. The payment sheet uses this so
// the displayed amount can never drift from what the server charges.
router.get(
  "/quote",
  asyncHandler(async (req, res) => {
    const { rows: orderRows } = await query(
      `SELECT o.id, o.quantity, o.delivery_fee, p.price AS unit_price
       FROM orders o
       JOIN products p ON p.id = o.product_id
       WHERE o.buyer_id = $1 AND o.status = 'accepted'`,
      [req.user.id]
    );

    const { rows: existingPayments } = await query(
      `SELECT order_ids FROM payments WHERE buyer_id = $1 AND status IN ('succeeded', 'awaiting_settlement', 'settled')`,
      [req.user.id]
    );
    const paidOrderSet = new Set();
    existingPayments.forEach((row) => {
      (Array.isArray(row.order_ids) ? row.order_ids : []).forEach((id) => paidOrderSet.add(String(id)));
    });

    const unpaid = orderRows.filter((order) => !paidOrderSet.has(String(order.id)));
    const lines = unpaid.map((order) =>
      computeFinancials({ unitPrice: order.unit_price, quantity: order.quantity, deliveryFee: order.delivery_fee })
    );
    const breakdown = {
      orderCount: unpaid.length,
      subtotal: lines.reduce((s, l) => s + l.productCents, 0) / 100,
      deliveryFee: lines.reduce((s, l) => s + l.deliveryCents, 0) / 100,
      platformFee: lines.reduce((s, l) => s + l.platformCents, 0) / 100,
      total: lines.reduce((s, l) => s + l.totalCents, 0) / 100,
      platformFeePercent: PLATFORM_FEE_PERCENT,
    };
    return res.json({
      quote: {
        ...breakdown,
        subtotalLabel: centsToEtb(breakdown.subtotal * 100),
        deliveryFeeLabel: centsToEtb(breakdown.deliveryFee * 100),
        platformFeeLabel: centsToEtb(breakdown.platformFee * 100),
        totalLabel: centsToEtb(breakdown.total * 100),
      },
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

    if (newStatus === "succeeded") {
      await recordPaymentSuccess(toSafePayment(updated[0]));
    }

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
