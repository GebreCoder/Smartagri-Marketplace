import { Router } from "express";
import { query, withTransaction } from "../db.js";
import { requireAuth, requireAdmin, requireFarmer } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { formatDateTime, getProfileName, normalizeText } from "../utils.js";
import { centsToEtb, genRef, recordLedgerEntry, syncPaymentSettlementStatus } from "../services/finance.js";
import { createNotification } from "../services/notifications.js";

const router = Router();
router.use(requireAuth);

const SETTLEMENT_SELECT = `
  SELECT s.id, s.order_id, s.farmer_id, s.buyer_id, s.product_amount_cents,
         s.delivery_fee_cents, s.platform_fee_cents, s.net_amount_cents,
         s.currency, s.status, s.reference, s.created_at, s.settled_at,
         o.quantity AS order_quantity, o.status AS order_status,
         p.name AS product_name,
         u.full_name AS farmer_name,
         b.full_name AS buyer_name
  FROM settlements s
  JOIN orders o ON o.id = s.order_id
  JOIN products p ON p.id = o.product_id
  LEFT JOIN users u ON u.id = s.farmer_id
  LEFT JOIN users b ON b.id = s.buyer_id
`;

const shapeSettlement = (row) => ({
  id: row.id,
  orderId: row.order_id,
  reference: row.reference,
  farmerId: row.farmer_id,
  buyerId: row.buyer_id,
  farmerName: getProfileName({ full_name: row.farmer_name }, "Farmer"),
  buyerName: getProfileName({ full_name: row.buyer_name }, "Buyer"),
  productName: row.product_name || "Product",
  orderQuantity: Number(row.order_quantity || 0),
  productAmount: centsToEtb(row.product_amount_cents),
  productAmountCents: Number(row.product_amount_cents || 0),
  deliveryFee: centsToEtb(row.delivery_fee_cents),
  deliveryFeeCents: Number(row.delivery_fee_cents || 0),
  platformFee: centsToEtb(row.platform_fee_cents),
  platformFeeCents: Number(row.platform_fee_cents || 0),
  netAmount: centsToEtb(row.net_amount_cents),
  netAmountCents: Number(row.net_amount_cents || 0),
  currency: row.currency || "ETB",
  status: row.status,
  createdAt: row.created_at,
  createdLabel: formatDateTime(row.created_at),
  settledAt: row.settled_at,
  settledLabel: row.settled_at ? formatDateTime(row.settled_at) : "",
});

// ── Farmer: own settlements ────────────────────────────────────────
// GET /api/settlements
router.get(
  "/",
  requireFarmer,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `${SETTLEMENT_SELECT} WHERE s.farmer_id = $1 ORDER BY s.created_at DESC`,
      [req.user.id]
    );

    const eligibleCents = rows
      .filter((row) => row.status === "eligible")
      .reduce((sum, row) => sum + Number(row.net_amount_cents || 0), 0);
    const settledCents = rows
      .filter((row) => row.status === "settled")
      .reduce((sum, row) => sum + Number(row.net_amount_cents || 0), 0);

    return res.json({
      settlements: rows.map(shapeSettlement),
      summary: {
        total: rows.length,
        eligibleCount: rows.filter((r) => r.status === "eligible").length,
        settledCount: rows.filter((r) => r.status === "settled").length,
        eligibleAmount: centsToEtb(eligibleCents),
        eligibleAmountCents: eligibleCents,
        settledAmount: centsToEtb(settledCents),
        settledAmountCents: settledCents,
      },
    });
  })
);

// ── Admin: all settlements ─────────────────────────────────────────
// GET /api/settlements/admin
router.get(
  "/admin",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`${SETTLEMENT_SELECT} ORDER BY s.created_at DESC`);

    const pendingCents = rows
      .filter((row) => row.status === "eligible" || row.status === "processing")
      .reduce((sum, row) => sum + Number(row.net_amount_cents || 0), 0);
    const settledCents = rows
      .filter((row) => row.status === "settled")
      .reduce((sum, row) => sum + Number(row.net_amount_cents || 0), 0);

    return res.json({
      settlements: rows.map(shapeSettlement),
      summary: {
        total: rows.length,
        pendingCount: rows.filter((r) => r.status === "eligible" || r.status === "processing").length,
        settledCount: rows.filter((r) => r.status === "settled").length,
        pendingAmount: centsToEtb(pendingCents),
        settledAmount: centsToEtb(settledCents),
      },
    });
  })
);

// ── Admin: process a settlement (mark paid out) ────────────────────
// POST /api/settlements/admin/:id/process
router.post(
  "/admin/:id/process",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const settlementId = normalizeText(req.params.id);
    if (!settlementId) return res.status(400).json({ message: "Missing settlement id." });

    const { rows } = await query(
      `SELECT s.id, s.order_id, s.farmer_id, s.buyer_id, s.net_amount_cents,
              s.platform_fee_cents, s.status, s.reference,
              p.id AS payment_id, p.provider, p.provider_payment_id
       FROM settlements s
       LEFT JOIN payments p ON p.order_ids ?| ARRAY[CAST(s.order_id AS text)]
       WHERE s.id = $1`,
      [settlementId]
    );
    const settlement = rows[0];
    if (!settlement) return res.status(404).json({ message: "Settlement not found." });
    if (settlement.status === "settled") {
      return res.status(400).json({ message: "This settlement was already processed." });
    }

    await withTransaction(async (client) => {
      const { rowCount } = await client.query(
        `UPDATE settlements SET status = 'settled', settled_at = now(), updated_at = now()
         WHERE id = $1 AND status <> 'settled'`,
        [settlementId]
      );
      if (!rowCount) {
        throw new Error("Settlement status changed — please refresh.");
      }

      // Permanent ledger record of the payout.
      await recordLedgerEntry({
        client,
        reference: genRef("PAYOUT"),
        orderId: settlement.order_id,
        paymentId: settlement.payment_id || null,
        buyerId: settlement.buyer_id,
        farmerId: settlement.farmer_id,
        provider: settlement.provider || "platform",
        providerReference: settlement.provider_payment_id || "",
        transactionType: "settlement",
        amountCents: settlement.net_amount_cents,
        meta: { settlementRef: settlement.reference, platformFeeCents: settlement.platform_fee_cents },
      });

      if (settlement.payment_id) {
        await syncPaymentSettlementStatus(client, settlement.payment_id);
      }
    });

    await createNotification({
      userId: settlement.farmer_id,
      type: "payment",
      title: "Settlement processed",
      body: `${centsToEtb(settlement.net_amount_cents)} was paid out to you for a completed order.`,
      link: "/farmer/orders",
    });

    return res.json({ message: "Settlement processed and marked as settled." });
  })
);

export default router;
