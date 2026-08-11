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
