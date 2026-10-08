// Browser smoke test: loads every dashboard page in headless Chrome and
// reports console errors / exceptions (which are what cause "white screens").
// Requires: server on :5000, vite dev on :5173, Chrome installed.
// Usage: node browser-smoke.mjs
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const API = "http://localhost:5000";
const APP = "http://localhost:5173";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  process.env.CHROME_PATH,
].filter(Boolean);

const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromePath) {
  console.error("Chrome not found. Set CHROME_PATH.");
  process.exit(1);
}

const fail = [];
const ok = [];

const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── launch Chrome with remote debugging ────────────────────────────
const profile = join(process.cwd(), "tmp", "chrome-smoke");
const chrome = spawn(chromePath, [
  "--headless=new",
  "--remote-debugging-port=9222",
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--disable-gpu",
  "about:blank",
], { stdio: "ignore" });

const getTarget = async (retries = 40) => {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch("http://localhost:9222/json");
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error("Chrome CDP did not come up.");
};

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let msgId = 0;
const pending = new Map();
const errors = [];

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    errors.push(`EXCEPTION: ${d.text} ${d.exception?.description || ""}`.slice(0, 400));
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    errors.push(`CONSOLE: ${msg.params.args.map((a) => a.value || a.description || "").join(" ")}`.slice(0, 400));
  }
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    errors.push(`LOG: ${msg.params.entry.text}`.slice(0, 400));
  }
};

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
};

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");

const goto = async (url, waitMs = 1800) => {
  errors.length = 0;
  await send("Page.navigate", { url });
  await sleep(waitMs);
  // Cold Vite starts (dependency re-optimization) can delay the first real
  // page render well past the initial wait — poll until text actually appears.
  let bodyText = "";
  for (let i = 0; i < 20; i += 1) {
    bodyText = await evaluate("document.body ? document.body.innerText.slice(0, 200) : ''");
    if (bodyText.trim().length > 0) break;
    await sleep(400);
  }
  return { bodyText, errors: [...errors] };
};

const login = async (token) => {
  await evaluate(`localStorage.setItem("smartagri_token", ${JSON.stringify(token)}); true`);
};

// localStorage is only usable on the app origin, so load it once up front.
await send("Page.navigate", { url: `${APP}/login` });
await sleep(1500);

try {
  // ── create test users ────────────────────────────────────────────
  const rand = Math.random().toString(36).slice(2, 8);
  const reg = async (role, name) => {
    const email = `smoke.${role}.${name}.${rand}@test.dev`;
    const { status, data } = await api("POST", "/api/auth/register", {
      body: { fullName: `Smoke ${role} ${name}`, phoneNumber: `+2519${rand.slice(0, 7)}`, email, role, businessName: role === "farmer" ? `${name} Farms` : "", location: "Addis Ababa", password: "password123" },
    });
    if (status !== 201) throw new Error(`register ${role} failed: ${status}`);
    return data.token;
  };
  const buyerToken = await reg("buyer", "bob");
  const farmerToken = await reg("farmer", "fred");
  const adminLogin = await api("POST", "/api/auth/login", { body: { email: "admin@smartagri.com", password: "admin1234" } });
  const adminToken = adminLogin.data.token;

  // ── smoke each route ─────────────────────────────────────────────
  const smoke = async (label, token, path, expectedText) => {
    await login(token);
    const result = await goto(`${APP}${path}`);
    const rendered = result.bodyText.length > 0 && (expectedText ? result.bodyText.includes(expectedText) : true);
    if (result.errors.length === 0 && rendered) {
      ok.push(`${label} ${path}`);
      console.log(`  ✓ ${label} ${path}`);
    } else {
      fail.push({ label, path, errors: result.errors, body: result.bodyText.slice(0, 120) });
      console.error(`  ✗ ${label} ${path}`);
      result.errors.forEach((e) => console.error(`      ${e}`));
    }
  };

  console.log("\n== Buyer pages ==");
  await smoke("buyer", buyerToken, "/buyer", "Dashboard");
  await smoke("buyer", buyerToken, "/buyer/orders", "My Orders");
  await smoke("buyer", buyerToken, "/buyer/cart", "Your Cart");
  await smoke("buyer", buyerToken, "/buyer/marketplace", "");
  await smoke("buyer", buyerToken, "/buyer/favorites", "");

  console.log("\n== Farmer pages ==");
  await smoke("farmer", farmerToken, "/farmer", "Dashboard");
  await smoke("farmer", farmerToken, "/farmer/orders", "Incoming Orders");
  await smoke("farmer", farmerToken, "/farmer/products", "");
  await smoke("farmer", farmerToken, "/farmer/analytics", "");
  await smoke("farmer", farmerToken, "/farmer/crops", "");
  await smoke("farmer", farmerToken, "/farmer/calendar", "");
  await smoke("farmer", farmerToken, "/farmer/market-prices", "");

  console.log("\n== Admin pages ==");
  await smoke("admin", adminToken, "/admin", "Overview");
  await smoke("admin", adminToken, "/admin/orders", "Orders");
  await smoke("admin", adminToken, "/admin/settlements", "Farmer Settlements");
  await smoke("admin", adminToken, "/admin/users", "");
  await smoke("admin", adminToken, "/admin/products", "");
  await smoke("admin", adminToken, "/admin/chat", "");
  await smoke("admin", adminToken, "/admin/reports", "");
} finally {
  ws.close();
  chrome.kill();
}

console.log(`\n== RESULT: ${ok.length} passed, ${fail.length} failed ==`);
if (fail.length) {
  console.error(JSON.stringify(fail, null, 2));
  process.exit(1);
}
process.exit(0);
