// ─── SmartAgri verify ────────────────────────────────────────────
// One command that proves the whole stack is healthy:
//   1. schema.sql vs migrations parity (npm run check:schema)
//   2. database seeded (admin account present)
//   3. API-level E2E workflow (server/test-workflow.mjs)
//   4. API contract test for notifications + settlements (server/test-notifications.mjs)
//   5. browser smoke across buyer / farmer / admin pages (server/browser-smoke.mjs)
//
// The API server and Vite dev server are started and stopped automatically.
// Requires: PostgreSQL reachable (server/.env), Chrome installed (browser phase).
// Usage:   npm run verify
//          VERIFY_BROWSER=0 npm run verify     # skip the browser phase
import { spawn } from "child_process";
import { existsSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import net from "net";

const root = dirname(fileURLToPath(import.meta.url));
const serverDir = join(root, "server");
const clientDir = join(root, "client");

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";
const NODE = "node";

const phases = [];
const phase = (name, ok, detail = "") => {
  phases.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

const run = (cmd, args, { cwd = root, timeoutMs = 180000 } = {}) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    const timer = setTimeout(() => {
      console.error("    timed out after " + (timeoutMs / 1000) + "s — killing.");
      child.kill();
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      console.error("    failed to spawn " + cmd + ": " + err.message);
      resolve(1);
    });
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(url, label, tries = 40, delayMs = 500) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status >= 100) return true; // any HTTP answer means it's up
    } catch { /* not up yet */ }
    await sleep(delayMs);
  }
  console.error("    " + label + " did not become ready at " + url);
  return false;
}

const portInUse = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });

const chromeCandidates = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  process.env.CHROME_PATH,
].filter(Boolean);
const chromePath = chromeCandidates.find((p) => existsSync(p));

const children = [];
const start = (cmd, args, cwd) => {
  const child = spawn(cmd, args, { cwd, stdio: "ignore", shell: process.platform === "win32" });
  children.push(child);
  return child;
};
const stopAll = async () => {
  for (const child of children) {
    try {
      if (process.platform === "win32" && child.pid) {
        // taskkill /T kills the whole tree — child.kill() only stops the
        // cmd.exe wrapper, orphaning the actual node/vite process on Windows.
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        child.kill();
      }
    } catch { /* already gone */ }
  }
  await sleep(1500);
};

try {
  console.log("\n== Phase 1 — Schema parity (schema.sql vs migrations) ==");
  const parity = await run(NPM, ["run", "check:schema"], { cwd: root, timeoutMs: 60000 });
  phase("schema parity", parity === 0, parity === 0 ? "" : "schema.sql drifted from migrations");

  console.log("\n== Phase 2 — Seed (ensures the admin account exists) ==");
  const seed = await run(NODE, ["src/seed.js"], { cwd: serverDir, timeoutMs: 60000 });
  phase("seed", seed === 0, seed === 0 ? "" : "is PostgreSQL running? check server/.env");

  console.log("\n== Phase 3 — Ports (5000 API, 5173 vite) ==");
  const busy5000 = await portInUse(5000);
  const busy5173 = await portInUse(5173);
  if (busy5000 || busy5173) {
    phase("ports free", false, busy5000 ? "port 5000 in use" : "port 5173 in use");
    console.error("   Stop the running server/vite first, then re-run npm run verify.");
    throw new Error("ports in use");
  }
  phase("ports free", true);

  console.log("\n== Phase 4 — Start API server on :5000 ==");
  start(NODE, ["src/index.js"], serverDir);
  const apiUp = await waitFor("http://localhost:5000/api/health", "API server");
  phase("API server up", apiUp, apiUp ? "" : "see server/.env + PostgreSQL");
  if (!apiUp) throw new Error("API server failed to start");

  console.log("\n== Phase 5 — API E2E workflow (test-workflow.mjs) ==");
  const workflow = await run(NODE, ["test-workflow.mjs"], { cwd: serverDir, timeoutMs: 240000 });
  phase("E2E workflow", workflow === 0, workflow === 0 ? "" : "buyer->farmer lifecycle test failed");

  console.log("\n== Phase 6 — Notifications & settlements contract test (test-notifications.mjs) ==");
  const notifs = await run(NODE, ["test-notifications.mjs"], { cwd: serverDir, timeoutMs: 240000 });
  phase("notifications contract", notifs === 0, notifs === 0 ? "" : "notifications/settlements test failed");

  console.log("\n== Phase 7 — AI contract test (test-ai.mjs, Groq primary / Gemini fallback) ==");
  if (process.env.VERIFY_AI === "0") {
    console.log("   (AI phase skipped: VERIFY_AI=0)");
    phase("AI contract", true, "skipped (VERIFY_AI=0)");
  } else {
    // test-ai.mjs exits 0 on success and also when no keys are configured
    // (self-reported skip) — any non-zero exit is a genuine provider failure.
    const ai = await run(NODE, ["test-ai.mjs"], { cwd: serverDir, timeoutMs: 180000 });
    phase("AI contract", ai === 0, ai === 0 ? "" : "AI provider failed — check GROQ_API_KEY / GEMINI_API_KEY");
  }

  let browserSkipped = false;
  if (process.env.VERIFY_BROWSER === "0") {
    browserSkipped = true;
    console.log("\n== Phase 8 — Browser smoke (skipped: VERIFY_BROWSER=0) ==");
  } else if (!chromePath) {
    browserSkipped = true;
    console.log("\n== Phase 8 — Browser smoke (skipped: Chrome not found — set CHROME_PATH) ==");
  } else {
    console.log("\n== Phase 8 — Start Vite dev server on :5173 ==");
    start(NPX, ["vite", "--port", "5173", "--strictPort"], clientDir);
    const viteUp = await waitFor("http://localhost:5173/", "Vite dev server");
    phase("vite up", viteUp);
    if (!viteUp) throw new Error("Vite failed to start");

    console.log("\n== Phase 9 — Browser smoke (buyer / farmer / admin pages) ==");
    const smoke = await run(NODE, ["browser-smoke.mjs"], { cwd: serverDir, timeoutMs: 300000 });
    phase("browser smoke", smoke === 0, smoke === 0 ? "" : "console errors or failed page loads");

    console.log("\n== Phase 10 — Browser AI chatbot interaction ==");
    const aiBrowser = await run(NODE, ["browser-ai-test.mjs"], { cwd: serverDir, timeoutMs: 180000 });
    phase("browser AI chat", aiBrowser === 0, aiBrowser === 0 ? "" : "chatbot UI or AI reply failed");
  }
  if (browserSkipped) console.log("   (browser phase skipped — set CHROME_PATH to enable)");
} finally {
  console.log("\n== Cleanup — stopping servers ==");
  await stopAll();
  // Remove the headless-Chrome profile the smoke test leaves behind.
  try { rmSync(join(serverDir, "tmp"), { recursive: true, force: true }); } catch { /* ignore */ }
}

const failed = phases.filter((p) => !p.ok);
console.log("\n== VERIFY: " + (phases.length - failed.length) + "/" + phases.length + " phases passed ==");
if (failed.length) {
  console.error("Failed:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
console.log("All checks green — SmartAgri is healthy.");
process.exit(0);
