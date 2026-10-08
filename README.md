# SmartAgri Marketplace

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socket.io&logoColor=white)](https://socket.io/)

A modern agri-commerce platform built to connect farmers and buyers directly, improve price transparency, and streamline operations across discovery, order fulfillment, payments, and settlements.

SmartAgri is designed for agricultural ecosystems where trust, speed, and visibility matter most. It brings together marketplace commerce, real-time communication, AI assistance, and role-based dashboards in one production-ready application.

## Overview

SmartAgri is a full-stack marketplace for agricultural products and trade workflows. It enables:

- farmers to list crops and manage inventory
- buyers to discover products and complete purchases
- admins to oversee platform activity and financial flows
- stakeholders to track orders, settlements, and communication in real time

The platform is built as a monorepo with a dedicated React frontend and Express backend, backed by PostgreSQL for reliable transactional data management.

## Why This Project Exists

Agriculture remains one of the most important economic sectors in many economies, yet a large part of the market still depends on fragmented communication and inefficient trade processes. SmartAgri addresses this by creating a digital marketplace that reduces friction, increases transparency, and improves trust between producers and buyers.

### Problems it solves

- fragmented farmer-to-buyer discovery
- unclear order status and fulfillment visibility
- delayed or inconsistent payment processes
- weak settlement tracking and financial auditability
- limited communication between parties during trade
- lack of operational insights for growers and platform managers

## Product Highlights

### For Buyers

- browse and search agricultural products
- discover products from multiple sellers
- compare offerings and purchase directly
- manage cart and multi-seller checkout workflows
- monitor order progress and delivery status
- receive notifications and messaging updates
- complete payments through simulated or Chapa-based flows

### For Farmers

- create and update product listings with image uploads
- handle incoming orders and fulfill them from a dashboard
- manage inventory and operational workflows
- track settlements and payout eligibility
- communicate directly with buyers
- monitor sales and order performance

### For Admins

- manage user accounts and marketplace activity
- review products, orders, and disputes
- process settlement requests
- monitor financial transactions and platform activity
- view operational and reporting data across the platform

### Platform Capabilities

- JWT-based authentication and role-aware access control
- real-time updates using Socket.IO
- AI-powered buyer/farmer assistance using Groq and Gemini
- Chapa payment integration support for Ethiopian financial flows
- settlement and ledger tracking for auditability
- modern responsive frontend experience with React and Vite

## Tech Stack

### Frontend

- React 19
- Vite
- React Router
- Socket.IO Client
- Responsive UI architecture

### Backend

- Node.js
- Express.js
- PostgreSQL via `pg`
- JWT authentication
- bcrypt password hashing
- Multer for upload handling
- Socket.IO for real-time events

### AI and Payments

- Groq AI
- Gemini AI
- Chapa integration

## Architecture

```text
┌──────────────────────┐         REST / WebSocket        ┌──────────────────────┐
│                      │  ─────────────────────────────▶ │                      │
│ React Frontend       │                                │ Express API Server   │
│ (Vite + React)       │  ◀─────────────────────────────  │ + Socket.IO          │
│                      │                                │                      │
└──────────────────────┘                                └──────────┬───────────┘
                                                                   │
                                                                   │ SQL
                                                                   ▼
                                                         ┌──────────────────────┐
                                                         │ PostgreSQL           │
                                                         │ smartagri_db         │
                                                         └──────────────────────┘
```

## Project Structure

```text
smartagri-marketplace/
├── client/                         # Frontend application
│   ├── src/
│   ├── index.html
│   ├── vite.config.js
│   └── .env.example
├── server/                         # Backend and business logic
│   ├── src/
│   ├── .env.example
│   └── uploads/
├── database/
│   ├── schema.sql
│   ├── migrations/
│   └── check-schema-parity.mjs
├── design-images/
├── images/
├── nginx.conf
├── package.json
├── package-lock.json
├── verify.mjs
├── README.md
├── .gitignore
└── .vscode/
```

## Getting Started

### Prerequisites

Before running the project locally, make sure you have:

- Node.js 18 or newer
- npm
- PostgreSQL installed and running
- a browser for local testing

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/smartagri-marketplace.git
cd smartagri-marketplace
```

### 2. Install Dependencies

```bash
npm install
```

This project uses a workspace setup with separate frontend and backend packages.

### 3. Create the Database

Create PostgreSQL database:

```bash
psql -U postgres -c "CREATE DATABASE smartagri_db;"
```

Load the schema:

```bash
psql -U postgres -d smartagri_db -f database/schema.sql
```

### 4. Configure Environment Variables

#### Server

```bash
cp server/.env.example server/.env
```

Windows PowerShell:

```powershell
Copy-Item server/.env.example server/.env
```

#### Client

```bash
cp client/.env.example client/.env
```

Windows PowerShell:

```powershell
Copy-Item client/.env.example client/.env
```

Update the required values in `server/.env`:

```env
PORT=5000
PUBLIC_URL=http://localhost:5000
DATABASE_URL=postgresql://localhost:5432/smartagri_db
JWT_SECRET=your_super_secure_secret_key
JWT_EXPIRES_IN=7d
```

Optional configuration for AI and payments:

```env
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
CHAPA_SECRET_KEY=your_chapa_secret_key
CHAPA_WEBHOOK_VERIFY_HASH=your_webhook_secret
```

### 5. Start the Application

```bash
npm run dev
```

The app will run with:

- Frontend: http://localhost:5173
- Backend API: http://localhost:5000
- Health endpoint: http://localhost:5000/api/health

### 6. Production Build

```bash
npm run build
npm start
```

The Express server serves the built frontend and exposes the API on the configured port.

### 7. Run Verification

```bash
npm run verify
```

The project includes verification scripts to validate:

- schema consistency
- seed data integrity
- marketplace workflow behavior
- notification and settlement contracts
- AI route behavior
- browser smoke checks for core flows

To skip browser-based smoke checks:

```bash
VERIFY_BROWSER=0 npm run verify
```

## Demo Accounts

The application includes seed data for quick testing.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@smartagri.com` | `admin1234` |
| Farmer | `farmer@smartagri.com` | `farmer123` |
| Buyer | `buyer@smartagri.com` | `buyer123` |

To seed the accounts:

```bash
npm run seed
```

To include demo marketplace data:

```bash
SEED_DEMO=true npm run seed
```

## Core User Journeys

### Buyer Journey

1. sign up or log in
2. browse agricultural products
3. add products to cart
4. check out and complete the payment step
5. track order updates from confirmation to delivery
6. confirm delivery and complete the purchase lifecycle

### Farmer Journey

1. log in to the farmer dashboard
2. list products and manage inventory
3. receive incoming orders
4. accept, prepare, and dispatch orders
5. monitor settlements and payout status

### Admin Journey

1. manage users and platform content
2. review orders, disputes, and reports
3. process settlements and financial records
4. monitor marketplace operations and communication flows

## API Overview

The backend includes a broad set of API routes covering authentication, products, cart, orders, notifications, settlements, AI, and administration.

### Authentication

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

### Marketplace and Orders

- `GET /api/products`
- `GET /api/products/featured`
- `POST /api/orders/from-cart`
- `POST /api/orders`
- `GET /api/orders/buyer`
- `GET /api/orders/farmer`
- `PATCH /api/orders/:id/status`

### Payments and Settlements

- `GET /api/payments/status`
- `GET /api/payments/quote`
- `POST /api/payments/chapa/initialize`
- `POST /api/payments/chapa/verify`
- `GET /api/settlements`
- `GET /api/settlements/admin`

### AI and Realtime

- `POST /api/ai/chat`
- `GET /api/notifications`
- Socket.IO events for order, notification, and messaging updates

## Security and Production Readiness

The project includes several important production-oriented safeguards:

- password hashing with bcrypt
- JWT validation for protected routes
- role-based authorization for buyers, farmers, and admins
- server-side payment verification patterns
- secure handling of environment configuration and uploaded assets

Before production deployment, ensure:

- `JWT_SECRET` is strong and unique
- PostgreSQL credentials are secured
- payment secrets are stored in a protected environment
- HTTPS is enabled in production
- admin credentials are rotated before public access

## Roadmap

The platform already includes a solid core marketplace foundation. Future enhancements may include:

- advanced analytics and reporting
- improved recommendation and product discovery
- deeper AI support for pricing and sales insights
- mobile-first optimizations and offline support
- CI/CD automation and production deployment workflows

## License

This project does not currently include a license file. If you plan to publish it publicly on GitHub, it is recommended to add an open-source license such as MIT or Apache 2.0 before release.

## Acknowledgments

SmartAgri was built to improve trust, efficiency, and transparency in agricultural commerce by combining modern web engineering with practical workflows for real-world farm-to-market activity.

---

Built to make agricultural trade more transparent, efficient, and connected.
