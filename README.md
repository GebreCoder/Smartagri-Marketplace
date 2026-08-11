# 🌾 AgriSpark — PERN Stack

AgriSpark connects **farmers** and **buyers** directly — no middlemen. This repository is the
full web re-implementation of the original React Native app, rebuilt as a modern
**P**ostgreSQL · **E**xpress · **R**eact · **N**ode.js application. All business logic from the
original app was preserved and ported 1:1.

> Database name: **`smartagri_db`**

---

## ✨ Features

| Area | Details |
| --- | --- |
| **Landing** | Hero carousel, categories, top products, features, how-it-works, testimonials, AI chatbot FAB |
| **Auth** | Register / login with roles (farmer, buyer), JWT in `localStorage`, forgot + reset password (token flow) |
| **Buyer** | Marketplace with search, category filters & pagination · product details · cart · batch orders · order status tracking · delivery confirmation · issue reporting · chat with farmers |
| **Farmer** | Dashboard with live stats · product CRUD with image upload · accept / reject orders · chat with buyers |
| **Admin** | Dashboard stats · user management (activate / deactivate / delete with related-data preview) · product moderation · order & dispute overview · chat monitoring · system reports |
| **AI Chatbot** | 4 languages (EN / Amharic / Afaan Oromo / Tigrinya), market prices tab, Groq primary + Gemini fallback — routed **through the Express server** |
| **Realtime** | Socket.IO — order updates, new messages, marketplace changes delivered live to connected users |

---

## 🧱 Tech Stack

- **Backend** — Node.js + Express, `pg` (PostgreSQL), `bcryptjs`, `jsonwebtoken`, `multer`, `socket.io`
- **Frontend** — React 19 + Vite, `react-router-dom`, `socket.io-client`, `react-icons`
- **Database** — PostgreSQL (`smartagri_db`), schema in [`database/schema.sql`](database/schema.sql)

```
┌────────────┐   REST /api  ┌──────────────┐   SQL    ┌───────────────┐
│ React SPA  │ ───────────▶ │  Express     │ ───────▶ │ PostgreSQL    │
│ (Vite)     │              │  API server  │          │ smartagri_db  │
│            │ ◀─────────── │  + Socket.IO │ ◀─────── │               │
└────────────┘   WebSocket  └──────────────┘          └───────────────┘
```

---

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js 18+** (npm included)
- **PostgreSQL** running locally (or a remote database URL)

### 2. Create the database

```bash
psql -U postgres -c "CREATE DATABASE smartagri_db;"
```

Apply the schema:

```bash
psql -U postgres -d smartagri_db -f database/schema.sql
```

### 3. Configure the server

```bash
cp server/.env.example server/.env
```

Edit `server/.env` — at minimum set:

```env
DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/smartagri_db
JWT_SECRET=<a-long-random-string>
```

> If you don't use `DATABASE_URL`, set `PG_HOST / PG_PORT / PG_USER / PG_PASSWORD / PG_DATABASE` instead.

### 4. Install dependencies

```bash
npm install
```

### 5. Seed the database (optional)

Creates the admin account and, with `SEED_DEMO=true`, demo users + products:

```bash
cd server
npm run seed            # admin only
SEED_DEMO=true npm run seed   # admin + demo farmers/buyers/products
```

Default seeded accounts:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@agrispark.com` | `admin1234` |
| Farmer (demo) | `farmer@agrispark.com` | `farmer123` |
| Buyer (demo) | `buyer@agrispark.com` | `buyer123` |

### 6. Run the app (development)

```bash
npm run dev
```

- 🖥️ Frontend: http://localhost:5173
- 🔌 API + Socket.IO: http://localhost:5000
- 💡 Health check: http://localhost:5000/api/health

### 7. Production build

```bash
npm run build          # builds client → client/dist
npm start              # Express serves the built client + API on :5000
```

---

## 🔑 Authentication Flow

1. Client sends credentials to `POST /api/auth/login` (or `/register`).
2. Server validates the password with `bcrypt` and returns a **JWT** + user object.
3. The client stores the token in **`localStorage`** and sends it as `Authorization: Bearer <token>`.
4. Every request is verified by the `requireAuth` middleware; role checks (`requireFarmer`, `requireAdmin`) gate dashboard routes.
5. Deactivated accounts (`farmer_inactive`, `buyer_inactive`) are blocked at login and by the token middleware.

---

## 🔌 API Overview

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | public | Create account |
| POST | `/api/auth/login` | public | Log in (JWT) |
| GET | `/api/auth/me` | user | Current profile |
| POST | `/api/auth/forgot-password` | public | Request reset token |
| POST | `/api/auth/reset-password` | public | Set new password |
| GET | `/api/products` | public | Marketplace (search/category/paging) |
| GET | `/api/products/featured` | public | Featured picks |
| GET/POST/PUT/DELETE | `/api/products` | farmer | Manage own products |
| GET/POST/PATCH/DELETE | `/api/cart` | buyer | Cart management |
| GET | `/api/orders/buyer` | buyer | My orders |
| GET | `/api/orders/farmer` | farmer | Incoming orders |
| POST | `/api/orders/from-cart` | buyer | Place batch order |
| POST | `/api/orders` | buyer | Buy now |
| PATCH | `/api/orders/:id/status` | farmer | Accept / reject |
| POST | `/api/orders/:id/confirm-delivery` | buyer | Confirm delivery |
| POST | `/api/orders/:id/report-issue` | buyer | Report an issue |
| GET | `/api/payments/status` | buyer | Paid orders, payment history & whether Chapa is enabled |
| POST | `/api/payments/from-orders` | buyer | Simulated batch payment for accepted orders |
| POST | `/api/payments/chapa/initialize` | buyer | Start a real Chapa hosted checkout (returns `checkout_url`) |
| POST | `/api/payments/chapa/verify` | buyer | Confirm a Chapa payment server-side |
| POST | `/api/payments/chapa/webhook` | public | Chapa webhook (HMAC-verified, flips payment to paid) |
| GET/POST | `/api/chat/...` | user | Conversations & messages |
| GET/PATCH/DELETE | `/api/admin/...` | admin | Users, products, orders, chat, reports |
| POST/DELETE | `/api/upload` | user | Image upload |
| POST | `/api/ai/chat` | public | AI chatbot proxy (Groq → Gemini) |
| GET | `/api/health` | public | Health check |

---

## 💳 Chapa Payments (Ethiopia)

Buyers can pay their accepted orders in one batch. With **no configuration** the app
uses the built-in simulation; add a Chapa secret key and the buyer's “Pay in batch”
button opens a **real hosted checkout** (Telebirr · CBE Birr · bank cards):

```env
# server/.env
CHAPA_SECRET_KEY=SECK_TEST_xxxxxxxx        # test keys start with SECK_TEST-
CHAPA_WEBHOOK_VERIFY_HASH=your_webhook_secret  # optional, from Chapa dashboard
# CHAPA_API_BASE=https://api.chapa.co/v1     # override only if needed
```

- Sign up at **https://dashboard.chapa.co** → grab **test keys** (free, instant).
- Sandbox mode is automatic: keys starting with `SECK_TEST-` / `PUBK_TEST-`.
- **2.5%** commission per successful domestic transaction.
- Flow: `POST /api/payments/chapa/initialize` creates a `pending` payment row and
  returns a hosted `checkout_url` → buyer pays at Chapa → the client polls
  `POST /api/payments/chapa/verify` (server re-confirms with Chapa) and/or Chapa
  fires the signed webhook at `/api/payments/chapa/webhook`. Only a `success`
  verification flips the row to `succeeded`; the buyer's Orders page then shows the
  green **Paid** badge.
- **Webhooks** need `CHAPA_WEBHOOK_VERIFY_HASH` set (same value as the Chapa
  dashboard **Settings → Webhooks → Secret Hash**); without it webhooks return 401.
- In production, set `PUBLIC_URL` to your real public origin — it becomes Chapa's
  `callback_url` / `return_url`.

---

## 🌐 Realtime Events (Socket.IO)

Clients authenticate sockets with the JWT via handshake auth. Events:

- `order:changed` — emitted to the buyer & farmer of an order on status changes
- `message:new` — emitted to an order room and both participants
- `message:cleared` — emitted when an admin clears a thread
- `product:changed` — broadcast when an admin removes a product

---

## 🤖 AI Chatbot

The chatbot lives at `client/src/components/AiChatbot.jsx` and talks to
`POST /api/ai/chat`. Add your keys to `server/.env`:

```env
GROQ_API_KEY=your_key        # primary (llama-3.3-70b-versatile)
GEMINI_API_KEY=your_key      # fallback (gemini-1.5-flash)
```

If neither key is set, the chatbot shows a friendly “AI is not configured” message.
Market prices are bundled in `client/src/data/agriSparkData.js` and always work offline.

---

## 📁 Project Structure

```
├── database/
│   └── schema.sql            # PostgreSQL schema for smartagri_db
├── server/
│   ├── .env.example
│   └── src/
│       ├── index.js          # Express + Socket.IO bootstrap
│       ├── config.js         # Env-driven config
│       ├── db.js             # pg pool + transactions
│       ├── utils.js          # Shared helpers (prices, roles, shaping)
│       ├── aiPrompt.js       # Chatbot system prompt
│       ├── seed.js           # Seed script
│       ├── middleware/       # auth (JWT), upload (multer), error handler
│       ├── routes/           # auth, users, products, cart, orders, chat, admin, upload, ai
│       └── socket.js         # Realtime layer
└── client/
    ├── .env.example
    ├── index.html
    ├── vite.config.js        # Dev proxy → :5000
    └── src/
        ├── main.jsx / App.jsx  # Router + guards
        ├── auth.jsx            # Auth context (JWT in localStorage)
        ├── api.js              # Fetch wrapper + upload helper
        ├── socket.js           # Socket.IO helper
        ├── Icon.jsx            # Ionicons icon mapping
        ├── data/agriSparkData.js
        ├── components/         # Shared UI (cards, chatbot, modals…)
        ├── pages/              # Landing, auth, buyer, farmer, admin, chat, profile
        └── styles/             # Design system CSS
```

---

## 🔐 Notes

- **Passwords** are hashed with `bcrypt` (cost 10).
- **Uploads** are stored on disk in `server/uploads/` and served at `/uploads`.
- **Password reset** currently returns the token in the API response (no email provider
  configured) so the flow can be completed end-to-end — wire up an email/SMS provider in
  `server/src/routes/auth.routes.js` when ready.
- **Payments** default to the simulated batch flow; adding a Chapa secret key upgrades
  the buyer checkout to a real payment (see [Chapa Payments](#-chapa-payments-ethiopia)).
