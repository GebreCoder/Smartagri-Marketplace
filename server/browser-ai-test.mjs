// Browser AI test: opens the SmartAgri landing page, clicks the "Ask AI"
// FAB, types a question into the chatbot, and verifies a real AI reply
// appears (not the error fallback). Requires: server on :5000, vite on :5173.
// Usage: node browser-ai-test.mjs
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const APP = "http://localhost:5173";
const API = "http://localhost:5000";

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = join(process.cwd(), "tmp", "chrome-ai-test");
const chrome = spawn(chromePath, [
  "--headless=new",
  "--remote-debugging-port=9223",
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--disable-gpu",
  "about:blank",
], { stdio: "ignore" });

const getTarget = async (retries = 40) => {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch("http://localhost:9223/json");
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
    errors.push(`EXCEPTION: ${d.text} ${d.exception?.description || ""}`.slice(0, 300));
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    errors.push(`CONSOLE: ${msg.params.args.map((a) => a.value || a.description || "").join(" ")}`.slice(0, 300));
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
await send("Page.enable");

const waitFor = async (expression, tries = 40, delayMs = 500) => {
  for (let i = 0; i < tries; i += 1) {
    try {
      if (await evaluate(expression)) return true;
    } catch { /* keep waiting */ }
    await sleep(delayMs);
  }
  return false;
};

const fail = [];
const ok = [];
const check = (name, cond, extra = "") => {
  if (cond) { ok.push(name); console.log(`  ✓ ${name}`); }
  else { fail.push(name); console.error(`  ✗ ${name} ${extra}`); }
};

// Self-skip when no provider keys are configured (mirrors test-ai.mjs).
try {
  const probeRes = await fetch(`${API}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }], lang: "en" }),
  });
  if (probeRes.status === 503) {
    console.log("(no provider keys configured — skipping browser AI test)");
    chrome.kill();
    process.exit(0);
  }
} catch { /* server unreachable — let the real assertions surface it */ }

try {
  console.log("\n== Landing page ==");
  await send("Page.navigate", { url: `${APP}/` });
  check("landing rendered", await waitFor("document.body && document.body.innerText.includes('Connecting Farmers')", 30, 500), "");

  console.log("\n== Open the chatbot (Ask AI FAB) ==");
  check("chat FAB present", await waitFor("!!document.querySelector('.chat-fab')", 20, 400), "");
  await evaluate("document.querySelector('.chat-fab').click(); true");

  console.log("\n== Let the greeting finish, pick a role ==");
  // The landing greeting ends with the role picker (Buyer / Farmer / Browsing).
  check("role picker appeared", await waitFor("document.querySelectorAll('.chatb-role-btn').length >= 3", 40, 500), "");
  await evaluate("document.querySelectorAll('.chatb-role-btn')[2].click(); true"); // "Just browsing"
  check("input enabled after role pick", await waitFor("(() => { const el = document.querySelector('.chatb-input'); return !!el && !el.disabled; })()", 30, 400), "");
  check("no console errors so far", errors.length === 0, errors[0] || "");

  console.log("\n== Send a question ==");
  const typed = await evaluate(`(() => {
    const input = document.querySelector('.chatb-input');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'What are teff prices today?');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  check("message typed into input", typed === true, "");
  // React must pick up the value before the send button unlocks.
  check("send button enabled", await waitFor("!document.querySelector('.chatb-send').disabled", 20, 200), "");
  const assistantBefore = await evaluate("document.querySelectorAll('.chatb-bubble-assistant').length");
  await evaluate("document.querySelector('.chatb-send').click(); true");
  check("user bubble added", await waitFor("[...document.querySelectorAll('.chatb-bubble-user')].some((b) => b.innerText.toLowerCase().includes('teff'))", 20, 400), "");

  console.log("\n== Wait for the AI reply (Groq / Gemini) ==");
  // Wait for a NEW assistant bubble (past the greeting sequence) that is
  // non-empty and not the client-side error fallback.
  const gotReply = await waitFor(`(() => {
    const bubbles = [...document.querySelectorAll('.chatb-bubble-assistant')];
    if (bubbles.length <= ${assistantBefore}) return false;
    const last = bubbles[bubbles.length - 1].innerText;
    return last.trim().length > 0 && !last.includes("couldn't reach the server");
  })()`, 60, 1000);
  check("AI reply appeared", gotReply, "timed out waiting for the AI response");

  const replyInfo = await evaluate(`(() => {
    const bubbles = [...document.querySelectorAll('.chatb-bubble-assistant')];
    const last = bubbles.length ? bubbles[bubbles.length - 1].innerText : '';
    const source = document.querySelector('.chatb-source')?.innerText || '';
    const hasError = !!document.querySelector('.chatb-error');
    return { length: last.length, preview: last.slice(0, 120), source, hasError };
  })()`);
  check("reply has real content", replyInfo.length > 20, `len=${replyInfo.length}`);
  check("reply mentions prices or market", /(ETB|price|Teff|market|farmer)/i.test(replyInfo.preview), replyInfo.preview);
  check("no error banner in chat", replyInfo.hasError === false, "");
  console.log(`   reply (${replyInfo.source || "no badge"}): ${replyInfo.preview}…`);
  check("no console errors overall", errors.length === 0, errors.join(" | "));
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
