-- ============================================================
-- SmartAgri — Migration 003: Order accepted timestamp
-- Database: smartagri_db
-- Run:  npm run migrate --workspace server
--
-- Adds accepted_at so the order lifecycle records when a farmer
-- confirmed the order (used by the PATCH status handler).
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_at timestamptz;


CREATE INDEX IF NOT EXISTS idx_orders_accepted ON orders(accepted_at) WHERE accepted_at IS NOT NULL;
