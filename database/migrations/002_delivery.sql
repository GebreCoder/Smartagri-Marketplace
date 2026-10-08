-- ============================================================
-- SmartAgri — Migration 002: Delivery tracking
-- Database: smartagri_db
-- Run:  psql -U postgres -d smartagri_db -f database/migrations/002_delivery.sql
--
-- 1. Widen orders.status with 'dispatched' (out for delivery)
-- 2. Add delivery info columns captured at checkout
-- 3. Add lifecycle timestamps for the order timeline
-- ============================================================

-- ── 1. Orders: allow the dispatched status ────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'accepted', 'dispatched', 'rejected', 'cancelled', 'delivered', 'completed'));

-- ── 2. Delivery info (idempotent adds) ────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_method  text NOT NULL DEFAULT 'delivery';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_notes   text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee     numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_method_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_delivery_method_check
      CHECK (delivery_method IN ('delivery', 'pickup'));
  END IF;
END $$;

-- ── 3. Lifecycle timestamps ───────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at  timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_dispatched ON orders(dispatched_at) WHERE dispatched_at IS NOT NULL;

-- Backfill: keep old rows consistent (delivery fee stays 0 for legacy orders).
UPDATE orders SET delivery_method = 'delivery', delivery_address = '' WHERE delivery_address IS NULL;
