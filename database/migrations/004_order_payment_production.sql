-- ============================================================
-- SmartAgri — Migration 004: Production order & payment workflow
-- Database: smartagri_db
-- Run:  npm run migrate --workspace server
--
-- 1. Orders: widen lifecycle with preparing / ready_for_delivery /
--    refunded, plus preparation timestamps, delivery confirmation
--    fields, a checkout group reference (multi-farmer batch) and an
--    idempotency key so duplicate requests never create two orders.
-- 2. Payments: widen the lifecycle (processing / cancelled /
--    refunded / partially_refunded / awaiting_settlement / settled)
--    and make batch references unique for idempotent callbacks.
-- 3. Settlements: farmer payouts, created when an order completes,
--    processed separately from the buyer's payment.
-- 4. Financial ledger: permanent audit trail of every money movement.
-- ============================================================

-- ── 1. Orders: full lifecycle ────────────────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending',            -- buyer placed the order (unpaid, awaiting farmer)
    'accepted',           -- farmer confirmed & reserved stock
    'preparing',          -- farmer is preparing the products
    'ready_for_delivery', -- farmer finished preparing
    'dispatched',         -- handed to delivery / out for delivery
    'delivered',          -- buyer confirmed physical receipt
    'completed',          -- order fully finished → settlement eligible
    'rejected',           -- farmer declined (terminal)
    'cancelled',          -- buyer cancelled while pending (terminal)
    'refunded'            -- paid order refunded (terminal)
  ));

-- Preparation timestamps
ALTER TABLE orders ADD COLUMN IF NOT EXISTS preparing_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_at      timestamptz;

-- Delivery confirmation audit
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_at  timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_by  uuid REFERENCES users(id) ON DELETE SET NULL;

-- Checkout batch grouping: every order created in one checkout shares
-- this reference (a buyer order covering several farmers' fulfillments).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS group_reference text NOT NULL DEFAULT '';

-- Idempotency: the buyer passes a client-generated reference so retries
-- of the same checkout never create duplicate orders.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_ref text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_ref
  ON orders(buyer_id, client_ref) WHERE client_ref <> '';

CREATE INDEX IF NOT EXISTS idx_orders_group ON orders(group_reference) WHERE group_reference <> '';
CREATE INDEX IF NOT EXISTS idx_orders_preparing ON orders(preparing_at) WHERE preparing_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_ready ON orders(ready_at) WHERE ready_at IS NOT NULL;

-- ── 2. Payments: full lifecycle + idempotency ────────────────
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN (
    'pending',              -- initiated, awaiting provider confirmation
    'processing',           -- provider verifying / webhook in flight
    'succeeded',            -- verified paid (canonical "paid" state)
    'failed',               -- provider reported a terminal failure
    'cancelled',            -- abandoned / superseded checkout
    'refunded',             -- fully refunded to the buyer
    'partially_refunded',   -- some covered orders refunded
    'awaiting_settlement',  -- covered orders completed, payout pending
    'settled'               -- farmer payouts processed
  ));

-- Idempotent callbacks: a batch reference may only be charged once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_batch_reference
  ON payments(batch_reference) WHERE batch_reference <> '';

-- ── 3. Settlements (farmer payouts) ──────────────────────────
-- Created when an order completes. The farmer's money is only eligible
-- after fulfillment -- never merely because the buyer paid.
CREATE TABLE IF NOT EXISTS settlements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE UNIQUE,
  farmer_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_amount_cents integer NOT NULL DEFAULT 0,
  delivery_fee_cents   integer NOT NULL DEFAULT 0,
  platform_fee_cents   integer NOT NULL DEFAULT 0,
  net_amount_cents     integer NOT NULL DEFAULT 0,
  currency             varchar(8) NOT NULL DEFAULT 'ETB',
  status               text NOT NULL DEFAULT 'eligible'
                       CHECK (status IN ('eligible', 'processing', 'settled', 'failed')),
  reference            text NOT NULL UNIQUE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  settled_at           timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlements_farmer ON settlements(farmer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status) WHERE status <> 'settled';

-- ── 4. Financial ledger (permanent audit trail) ──────────────
-- transaction_type: 'payment' (buyer → platform), 'platform_fee'
-- (platform retains), 'refund' (platform → buyer), 'settlement'
-- (platform → farmer). Every row is immutable in practice -- we never
-- update historical financial records, only add new ones.
CREATE TABLE IF NOT EXISTS financial_transactions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference          text NOT NULL UNIQUE,
  order_id           uuid REFERENCES orders(id) ON DELETE SET NULL,
  payment_id         uuid REFERENCES payments(id) ON DELETE SET NULL,
  buyer_id           uuid REFERENCES users(id) ON DELETE SET NULL,
  farmer_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  provider           text NOT NULL DEFAULT '',
  provider_reference text NOT NULL DEFAULT '',
  transaction_type   text NOT NULL CHECK (transaction_type IN (
                       'payment', 'platform_fee', 'delivery_fee', 'refund', 'settlement'
                     )),
  amount_cents       integer NOT NULL DEFAULT 0,
  currency           varchar(8) NOT NULL DEFAULT 'ETB',
  status             text NOT NULL DEFAULT 'completed'
                     CHECK (status IN ('pending', 'completed', 'failed')),
  meta               jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_order ON financial_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_financial_payment ON financial_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_financial_farmer ON financial_transactions(farmer_id);
CREATE INDEX IF NOT EXISTS idx_financial_buyer ON financial_transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_financial_type ON financial_transactions(transaction_type);
