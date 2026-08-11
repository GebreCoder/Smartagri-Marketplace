-- ============================================================
-- AgriSpark — PostgreSQL Schema (PERN stack)
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
-- status: 'pending' → 'accepted' | 'rejected'
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity    integer NOT NULL,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);

-- ------------------------------------------------------------
-- MESSAGES (order-linked chat between buyer / farmer / admin)
-- Special message prefixes used by the app logic:
--   'Issue reported: …'  → counted as a report/dispute
--   'Buyer confirmed delivery' → delivery confirmation event
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  is_read     boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_messages_order ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);

-- ------------------------------------------------------------
-- PAYMENTS (provider payment records tied to a batch of accepted orders)
-- The app currently simulates checkout client-side; this table is kept
-- ready for real payment-provider integration (Telebirr / Chapa / bank).
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
                      CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  batch_reference     text,
  raw_response        jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

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
