-- ============================================================
-- SmartAgri — Migration 001: Order lifecycle + notifications
-- Database: smartagri_db
-- Run:  psql -U postgres -d smartagri_db -f database/migrations/001_order_lifecycle.sql
--
-- 1. Extends orders.status with cancelled / delivered / completed
-- 2. Adds order_events (auditable order timeline → step tracker)
-- 3. Adds notifications (persistent in-app notification center)
-- ============================================================

-- ── 1. Orders: widen the allowed status values ──────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'delivered', 'completed'));

-- ── 2. Order timeline (event log per order) ─────────────────
CREATE TABLE IF NOT EXISTS order_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role text NOT NULL DEFAULT '',
  event_type text NOT NULL DEFAULT 'system',
  label      text NOT NULL DEFAULT '',
  note       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, created_at ASC);

-- ── 3. Notifications center ─────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  type       text NOT NULL DEFAULT 'system',
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  link       text NOT NULL DEFAULT '',
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE is_read = false;
