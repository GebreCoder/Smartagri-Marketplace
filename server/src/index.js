import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { config } from "./config.js";
import { initSocket } from "./socket.js";
import { errorHandler, notFound } from "./middleware/error.js";

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/users.routes.js";
import productRoutes from "./routes/products.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import orderRoutes from "./routes/orders.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import paymentRoutes from "./routes/payments.routes.js";
import aiRoutes from "./routes/ai.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure the uploads directory exists
if (!fs.existsSync(config.uploadsDir)) {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(
  express.json({
    limit: "2mb",
    // Keep the raw JSON bytes for webhook signature verification (Chapa HMAC).
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

// Uploaded images served publicly at /uploads
app.use("/uploads", express.static(config.uploadsDir));

// ── API routes ─────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "agrispark-api" }));
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/ai", aiRoutes);

// ── Serve the built React client in production ─────────────────────
const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use(notFound);
app.use(errorHandler);

// ── HTTP + Socket.IO ───────────────────────────────────────────────
const server = http.createServer(app);
initSocket(server);

server.listen(config.port, () => {
  console.log(`🌾 AgriSpark API running at http://localhost:${config.port}`);
  console.log(`   Socket.IO enabled · uploads dir: ${config.uploadsDir}`);
});
