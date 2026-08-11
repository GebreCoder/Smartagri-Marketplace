// ─── Chapa payment gateway (Ethiopia) ─────────────────────────────
// Docs: https://developer.chapa.co · Dashboard: https://dashboard.chapa.co
//
// Test mode: use SECK_TEST-... / PUBK_TEST-... keys from the dashboard.
// Sandbox wallets/cards are simulated on Chapa's hosted checkout page.
import crypto from "crypto";
import { config } from "../config.js";

const SUCCESS_STATUS = "success";

/** True when a Chapa secret key is configured (otherwise the app uses simulation). */
export const isChapaConfigured = () => Boolean(config.chapa.secretKey);

const apiHeaders = () => ({
  Authorization: `Bearer ${config.chapa.secretKey}`,
  "Content-Type": "application/json",
});

/**
 * Start a hosted checkout at Chapa.
 * @returns {{ checkout_url: string, tx_ref: string }}
 */
export async function initializeChapaPayment({
  amountEtb,
  txRef,
  email,
  firstName,
  lastName,
  phoneNumber,
  callbackUrl,
  returnUrl,
}) {
  const payload = {
    amount: Number(amountEtb || 0).toFixed(2),
    currency: "ETB",
    tx_ref: txRef,
    callback_url: callbackUrl,
    return_url: returnUrl,
    first_name: firstName || "AgriSpark",
    last_name: lastName || "Buyer",
    email: email || "buyer@agrispark.com",
    phone_number: phoneNumber || "",
  };

  const res = await fetch(`${config.chapa.apiBase}/transaction/initialize`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.data?.checkout_url) {
    throw new Error(data?.message || "Chapa could not initialize the payment.");
  }
  return data.data;
}

/**
 * Confirm a transaction's final state server-side.
 * Throws when Chapa itself errors (bad key, outage, malformed ref) so
 * callers surface the real problem instead of silently treating the
 * payment as unpaid.
 * @returns {{ status: string, amount?: string, currency?: string, ... }}
 */
export async function verifyChapaPayment(txRef) {
  let res;
  try {
    res = await fetch(
      `${config.chapa.apiBase}/transaction/verify/${encodeURIComponent(txRef)}`,
      { method: "GET", headers: apiHeaders() }
    );
  } catch (error) {
    throw new Error(`Could not reach Chapa to verify the payment: ${error.message}`);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || `Chapa verification failed (HTTP ${res.status}).`);
  }
  return data?.data || {};
}

export const isChapaSuccess = (verification) => verification?.status === SUCCESS_STATUS;

// Only these statuses mean the transaction is definitively dead.
const TERMINAL_FAILED_STATUSES = new Set(["failed", "cancelled", "expired"]);

/** True only when Chapa reports an explicit terminal failure (not "still pending"). */
export const isChapaTerminalFailure = (verification) =>
  TERMINAL_FAILED_STATUSES.has(String(verification?.status || "").toLowerCase());

/**
 * Verify the HMAC-SHA256 signature Chapa puts on webhook requests.
 * The hash is computed over the raw JSON body using your webhook secret.
 */
export function verifyChapaWebhookSignature(rawBody, signature) {
  if (!config.chapa.webhookHash || !rawBody || !signature) return false;
  const expected = crypto.createHmac("sha256", config.chapa.webhookHash).update(rawBody).digest("hex");
  return expected === signature;
}
