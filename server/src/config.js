import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const read = (key, fallback = "") => {
  const value = process.env[key];
  return value === undefined || value === "" ? fallback : value;
};

export const config = {
  port: Number(read("PORT", "5000")),
  publicUrl: read("PUBLIC_URL", "http://localhost:5000"),
  databaseUrl: read("DATABASE_URL", ""),
  pg: {
    host: read("PG_HOST", "localhost"),
    port: Number(read("PG_PORT", "5432")),
    user: read("PG_USER", "postgres"),
    password: read("PG_PASSWORD", "postgres"),
    database: read("PG_DATABASE", "smartagri_db"),
  },
  jwtSecret: read("JWT_SECRET", "smartagri-dev-secret-change-me"),
  jwtExpiresIn: read("JWT_EXPIRES_IN", "7d"),
  // Platform/service fee — a percentage of the product subtotal retained
  // by SmartAgri when the buyer pays (the farmer receives the rest).
  platformFeePercent: Number(read("PLATFORM_FEE_PERCENT", "5")),
  // How long after an order completes until the farmer's settlement
  // becomes eligible (days). 0 = eligible immediately on completion.
  settlementHoldDays: Number(read("SETTLEMENT_HOLD_DAYS", "0")),
  groqApiKey: read("GROQ_API_KEY", ""),
  geminiApiKey: read("GEMINI_API_KEY", ""),
  // Current provider model ids (override in .env when providers rotate models).
  groqModel: read("GROQ_MODEL", "groq/compound"),
  geminiModel: read("GEMINI_MODEL", "gemini-3.6-flash"),
  chapa: {
    secretKey: read("CHAPA_SECRET_KEY", ""),
    webhookHash: read("CHAPA_WEBHOOK_VERIFY_HASH", ""),
    apiBase: read("CHAPA_API_BASE", "https://api.chapa.co/v1"),
  },
  uploadsDir: path.resolve(__dirname, "../uploads"),
  seed: {
    adminName: read("SEED_ADMIN_NAME", "Admin SmartAgri"),
    adminEmail: read("SEED_ADMIN_EMAIL", "admin@smartagri.com"),
    adminPassword: read("SEED_ADMIN_PASSWORD", "admin1234"),
  },
};
