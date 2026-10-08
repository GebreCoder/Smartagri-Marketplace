-- ============================================================
-- SmartAgri — PostgreSQL Schema (PERN stack)
-- Database: smartagri_db
-- Run:  psql -U postgres -d smartagri_db -f database/schema.sql
-- ============================================================

-- Enable UUID generation helper (built into Postgres 13+, safe to call)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- USERS
-- role values:
--   'admin'            → platform administrator (always active)
--   'farmer'           → active farmer
--   'farmer_inactive'  → deactivated farmer (blocked from login)
--   'buyer'            → active buyer
--   'buyer_inactive'   → deactivated buyer (blocked from login)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  full_name         text NOT NULL,
  email             text NOT NULL UNIQUE,
  phone_number      text NOT NULL DEFAULT '',
  role              text NOT NULL DEFAULT 'buyer',
  business_name     text NOT NULL DEFAULT '',
  location          text NOT NULL DEFAULT '',
  password          text NOT NULL,
  profile_image_url text,
  biography         text,
  read_receipts     boolean NOT NULL DEFAULT true,
  CONSTRAINT users_role_check CHECK (role IN (
    'admin',
    'farmer', 'farmer_inactive',
    'buyer', 'buyer_inactive'
  ))
);

-- ------------------------------------------------------------
-- PRODUCTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  category    text NOT NULL DEFAULT 'Other',
  description text NOT NULL DEFAULT '',
  price       numeric NOT NULL DEFAULT 0,
  quantity    integer NOT NULL DEFAULT 0,
  location    text NOT NULL DEFAULT '',
  image_url   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_farmer ON products(farmer_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- ------------------------------------------------------------
-- CART ITEMS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cart_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity    integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cart_items_buyer_product_unique UNIQUE (buyer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_buyer ON cart_items(buyer_id);

-- ------------------------------------------------------------
-- ORDERS
-- Full lifecycle (buyer → farmer):
--   'pending'            → buyer placed the order (unpaid, awaiting farmer)
--   'accepted'           → farmer confirmed & reserved stock (auto-dec)
--   'preparing'          → farmer is preparing the products
--   'ready_for_delivery' → farmer finished preparing
--   'dispatched'         → handed to delivery / out for delivery
--   'delivered'          → buyer confirmed physical receipt
--   'completed'          → order fully finished → settlement eligible
--   'rejected'           → farmer declined (terminal)
--   'cancelled'          → buyer cancelled while pending (terminal)
--   'refunded'           → paid order refunded (terminal)
-- Payment (paid/unpaid) is tracked separately in `payments`.
-- Delivery info (method / address / notes / fee) is captured at checkout.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity         integer NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'accepted', 'preparing', 'ready_for_delivery', 'dispatched', 'delivered', 'completed', 'rejected', 'cancelled', 'refunded')),
  delivery_method  text NOT NULL DEFAULT 'delivery'
                   CHECK (delivery_method IN ('delivery', 'pickup')),
  delivery_address text NOT NULL DEFAULT '',
  delivery_notes   text NOT NULL DEFAULT '',
  delivery_fee     numeric NOT NULL DEFAULT 0,
  accepted_at      timestamptz,
  preparing_at     timestamptz,
  ready_at         timestamptz,
  dispatched_at    timestamptz,
  delivered_at     timestamptz,
  completed_at     timestamptz,
  confirmed_at     timestamptz,
  confirmed_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  group_reference  text NOT NULL DEFAULT '',
  client_ref       text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Checkout idempotency: the buyer passes a client-generated reference so
-- retries of the same checkout never create duplicate orders.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_ref
  ON orders(buyer_id, client_ref) WHERE client_ref <> '';

CREATE INDEX IF NOT EXISTS idx_orders_group ON orders(group_reference) WHERE group_reference <> '';
CREATE INDEX IF NOT EXISTS idx_orders_dispatched ON orders(dispatched_at) WHERE dispatched_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_preparing ON orders(preparing_at) WHERE preparing_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_ready ON orders(ready_at) WHERE ready_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_accepted ON orders(accepted_at) WHERE accepted_at IS NOT NULL;

-- ------------------------------------------------------------
-- ORDER EVENTS (auditable timeline — powers the step tracker on
-- both the buyer's and the farmer's side)
-- event_type: 'placed' | 'accepted' | 'dispatched' | 'rejected' | 'cancelled'
--             | 'paid' | 'delivered' | 'completed' | 'issue_reported' | 'system'
-- ------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);

-- ------------------------------------------------------------
-- MESSAGES (order-linked chat between buyer / farmer / admin)
-- Special message prefixes used by the app logic:
--   'Issue reported: …'  → counted as a report/dispute
--   'Buyer confirmed delivery' → delivery confirmation event
-- ------------------------------------------------------------
-- DIRECT CONVERSATIONS (Telegram/Facebook-style 1:1 chat between any two users)
CREATE TABLE IF NOT EXISTS conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  CONSTRAINT conversations_distinct CHECK (user_a <> user_b)
);

-- Canonical ordering: user_a < user_b so a pair has exactly one row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_pair ON conversations(
  LEAST(user_a, user_b), GREATEST(user_a, user_b)
);

CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid REFERENCES orders(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message         text NOT NULL,
  image_url       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  is_read         boolean NOT NULL DEFAULT false,
  CONSTRAINT messages_target_check CHECK ((order_id IS NOT NULL) <> (conversation_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_messages_order ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last ON conversations(last_message_at DESC);

-- ------------------------------------------------------------
-- PAYMENTS (provider payment records tied to a batch of accepted orders)
-- The app currently simulates checkout client-side; this table is kept
-- ready for real payment-provider integration (Telebirr / Chapa / bank).
-- status values:
--   'pending'             → initiated, awaiting provider confirmation
--   'processing'          → provider verifying / webhook in flight
--   'succeeded'           → verified paid (canonical "paid" state)
--   'failed'              → provider reported a terminal failure
--   'cancelled'           → abandoned / superseded checkout
--   'refunded'            → fully refunded to the buyer
--   'partially_refunded'  → some covered orders refunded
--   'awaiting_settlement' → covered orders completed, payout pending
--   'settled'             → farmer payouts processed
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_ids           jsonb NOT NULL DEFAULT '[]',
  order_count         integer NOT NULL DEFAULT 1,
  provider            text NOT NULL,
  provider_payment_id text,
  amount_cents        integer NOT NULL,
  currency            varchar(8) NOT NULL DEFAULT 'ETB',
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded', 'awaiting_settlement', 'settled')),
  batch_reference     text,
  raw_response        jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Idempotent callbacks: a batch reference may only be charged once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_batch_reference
  ON payments(batch_reference) WHERE batch_reference <> '';

-- ------------------------------------------------------------
-- PASSWORD RESETS (token-based recovery, replaces Supabase email flow)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);

-- ------------------------------------------------------------
-- CROPS (farmer's farm management)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crops (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  category     text NOT NULL DEFAULT 'Vegetables',
  growth_stage text NOT NULL DEFAULT 'Growing',
  planted_date date,
  progress     integer NOT NULL DEFAULT 0,
  health       text NOT NULL DEFAULT 'Good',
  image_url    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crops_farmer ON crops(farmer_id);

-- ------------------------------------------------------------
-- FARM ACTIVITIES (farmer calendar / quick actions)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS farm_activities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  activity_type text NOT NULL DEFAULT 'task',
  crop_name     text NOT NULL DEFAULT '',
  activity_date date NOT NULL,
  status        text NOT NULL DEFAULT 'planned',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_farm_activities_farmer ON farm_activities(farmer_id);

-- ------------------------------------------------------------
-- HARVESTS (production records → farm performance)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS harvests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name    text NOT NULL DEFAULT '',
  category     text NOT NULL DEFAULT 'Vegetables',
  quantity_kg  numeric NOT NULL DEFAULT 0,
  harvested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_harvests_farmer ON harvests(farmer_id);

-- ------------------------------------------------------------
-- FAVORITES (buyer saves products & follows farmers)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farmer_id  uuid REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  price_at_favorite numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT favorites_target_check CHECK (farmer_id IS NOT NULL OR product_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_favorites_buyer ON favorites(buyer_id);
-- Dedupe: a buyer may favorite a product (no farmer) or follow a farmer (no product) at most once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_product ON favorites(buyer_id, product_id) WHERE farmer_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_farmer ON favorites(buyer_id, farmer_id) WHERE product_id IS NULL;

-- ------------------------------------------------------------
-- BUYER BUDGETS (monthly spending target per buyer)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budgets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month      text NOT NULL, -- 'YYYY-MM'
  amount     numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (buyer_id, month)
);

CREATE INDEX IF NOT EXISTS idx_budgets_buyer ON budgets(buyer_id);

-- ------------------------------------------------------------ (reference wholesale prices per kg/100kg)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_prices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  category   text NOT NULL DEFAULT 'Vegetables',
  unit       text NOT NULL DEFAULT 'kg',
  price      numeric NOT NULL DEFAULT 0,
  change_pct numeric NOT NULL DEFAULT 0,
  trend      text NOT NULL DEFAULT 'up',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_prices_category ON market_prices(category);

-- ------------------------------------------------------------
-- NOTIFICATIONS (persistent in-app notification center — powers
-- the bell in the buyer & farmer dashboards). Rows are created by
-- order / payment / chat events and delivered live via Socket.IO.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  type       text NOT NULL DEFAULT 'system', -- order | payment | message | system
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  link       text NOT NULL DEFAULT '',
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE is_read = false;

-- ------------------------------------------------------------
-- SETTLEMENTS (farmer payouts)
-- Created when an order completes. The farmer's money is only eligible
-- after fulfillment -- never merely because the buyer paid.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- FINANCIAL LEDGER (permanent audit trail of every money movement)
-- transaction_type: 'payment' (buyer → platform), 'platform_fee'
-- (platform retains), 'delivery_fee', 'refund' (platform → buyer),
-- 'settlement' (platform → farmer). Rows are immutable in practice --
-- we never update historical financial records, only add new ones.
-- ------------------------------------------------------------
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
