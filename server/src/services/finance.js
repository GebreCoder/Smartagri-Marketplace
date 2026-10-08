// ─── Finance service: platform fees, ledger, settlements, refunds ──
// Keeps every money movement auditable and separate from the order and
// payment lifecycles (see spec sections 6, 16, 17, 18, 19).
import { config } from "../config.js";
import { query } from "../db.js";

export const PLATFORM_FEE_PERCENT = Math.max(0, Number(config.platformFeePercent || 0));

/** Amounts in cents for a single order line (backend-authoritative). */
export const computeFinancials = ({ unitPrice, quantity, deliveryFee = 0 }) => {
  const productCents = Math.round(Number(unitPrice || 0) * Number(quantity || 1) * 100);
  const deliveryCents = Math.round(Math.max(0, Number(deliveryFee || 0)) * 100);
  const platformCents = Math.round((productCents * PLATFORM_FEE_PERCENT) / 100);
  const totalCents = productCents + deliveryCents + platformCents;
  return { productCents, deliveryCents, platformCents, totalCents };
};

/** Human-readable ETB string from cents. */
export const centsToEtb = (cents) =>
  `ETB ${(Number(cents || 0) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Short unique reference used by settlements + ledger rows. */
export const genRef = (prefix = "REF") =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

/**
 * Append a row to the financial ledger. `client` is optional so calls can
 * run inside the caller's transaction. Rows are append-only — we never
 * mutate historical financial records.
 */
export const recordLedgerEntry = async ({
  client,
  reference,
  orderId = null,
  paymentId = null,
  buyerId = null,
  farmerId = null,
  provider = "",
  providerReference = "",
  transactionType,
  amountCents,
  currency = "ETB",
  status = "completed",
  meta = {},
}) => {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(
    `INSERT INTO financial_transactions
       (reference, order_id, payment_id, buyer_id, farmer_id, provider,
        provider_reference, transaction_type, amount_cents, currency, status, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
     ON CONFLICT (reference) DO NOTHING
     RETURNING id`,
    [
      reference,
      orderId,
      paymentId,
      buyerId,
      farmerId,
      provider,
      providerReference,
      transactionType,
      Math.round(Number(amountCents || 0)),
      currency,
      status,
      JSON.stringify(meta),
    ]
  );
  return rows[0] || null;
};

/**
 * Create the farmer settlement for a completed order. Called inside the
 * same transaction that marks the order completed, so a settlement can
 * never be lost. Returns the settlement row.
 */
export const createSettlementForOrder = async ({
  client,
  orderId,
  farmerId,
  buyerId,
  financials, // { productCents, deliveryCents, platformCents, totalCents }
  reference,
}) => {
  const { rows } = await client.query(
    `INSERT INTO settlements
       (order_id, farmer_id, buyer_id, product_amount_cents, delivery_fee_cents,
        platform_fee_cents, net_amount_cents, reference)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (order_id) DO NOTHING
     RETURNING id, order_id, farmer_id, product_amount_cents, delivery_fee_cents,
               platform_fee_cents, net_amount_cents, status, reference, created_at`,
    [
      orderId,
      farmerId,
      buyerId,
      financials.productCents,
      financials.deliveryCents,
      financials.platformCents,
      financials.productCents + financials.deliveryCents,
      reference,
    ]
  );
  return rows[0] || null;
};

/**
 * Mark a payment row as awaiting settlement / settled based on its
 * covered orders' settlement status. Helper used by the settlement flow.
 */
export const syncPaymentSettlementStatus = async (client, paymentId) => {
  const { rows } = await client.query(
    `SELECT p.id,
            COUNT(*)::int AS total_count,
            COUNT(s.id) FILTER (WHERE s.status = 'settled')::int AS settled_count,
            COUNT(*) FILTER (WHERE o.status = 'refunded' OR o.status = 'cancelled' OR o.status = 'rejected')::int AS dead_count,
            COUNT(*) FILTER (WHERE s.id IS NOT NULL AND s.status <> 'settled')::int AS eligible_count
     FROM payments p
     CROSS JOIN LATERAL jsonb_array_elements_text(p.order_ids) AS ids(order_id)
     JOIN orders o ON o.id = ids.order_id::uuid
     LEFT JOIN settlements s ON s.order_id = o.id
     WHERE p.id = $1
     GROUP BY p.id`,
    [paymentId]
  );
  const row = rows[0];
  if (!row) return;
  const total = Number(row.total_count || 0);
  const settled = Number(row.settled_count || 0);
  const eligible = Number(row.eligible_count || 0);

  if (total > 0 && settled >= total) {
    // Every covered order has a processed payout and none was refunded.
    await client.query(
      `UPDATE payments SET status = 'settled', updated_at = now()
       WHERE id = $1 AND status IN ('succeeded', 'awaiting_settlement', 'partially_refunded')`,
      [paymentId]
    );
  } else if (eligible > 0) {
    // Some orders are completed but their payout is not processed yet.
    await client.query(
      `UPDATE payments SET status = 'awaiting_settlement', updated_at = now()
       WHERE id = $1 AND status IN ('succeeded', 'awaiting_settlement')`,
      [paymentId]
    );
  }
  // Refunded / partially_refunded payments are set by the refund flow and
  // intentionally left untouched here.
};
