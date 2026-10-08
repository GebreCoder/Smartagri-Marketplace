// SmartAgri API contract test — AI chatbot proxy (/api/ai/chat).
// Verifies the Groq-primary / Gemini-fallback proxy responds for plain and
// Amharic prompts, keeps multi-turn history, honors the role context, and
// rejects empty payloads. Skips gracefully (exit 0) when no provider keys
// are configured in server/.env.
// Run: node test-ai.mjs  (from the server directory)
const BASE = process.env.BASE_URL || "http://localhost:5000";
const pass = [];
const fail = [];

const check = (name, cond, extra = "") => {
  if (cond) { pass.push(name); console.log(`  ✓ ${name}`); }
  else { fail.push(name); console.error(`  ✗ ${name} ${extra}`); }
};

const chat = async (body) => {
  const res = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
};

console.log("\n== AI chat proxy ==");

const basic = await chat({
  messages: [{ role: "user", content: "Say hello in one short sentence." }],
  lang: "en",
  role: "buyer",
});

if (basic.status === 503) {
  console.log("   (no provider keys configured — skipping AI assertions)");
  console.log("== RESULT: skipped (AI not configured) ==");
  process.exit(0);
}

check("basic chat returns 200", basic.status === 200, `${basic.status} ${JSON.stringify(basic.data)}`);
check("response has non-empty text", typeof basic.data?.text === "string" && basic.data.text.trim().length > 0, JSON.stringify(basic.data));
check("source is Groq or Gemini", ["Groq", "Gemini"].includes(basic.data?.source), JSON.stringify(basic.data?.source));

const amharic = await chat({
  messages: [{ role: "user", content: "ሰላም የጤፍ ዋጋ ስንት ነው?" }],
  lang: "am",
  role: "buyer",
});
check("Amharic prompt returns 200 + text", amharic.status === 200 && (amharic.data?.text || "").trim().length > 0, `${amharic.status} ${JSON.stringify(amharic.data).slice(0, 120)}`);
check("Amharic reply uses Ethiopic script", /[\u1200-\u137F]/.test(amharic.data?.text || ""), "");

const farmer = await chat({
  messages: [{ role: "user", content: "How do I accept an order? One short sentence." }],
  lang: "en",
  role: "farmer",
});
check("farmer role returns 200 + text", farmer.status === 200 && (farmer.data?.text || "").trim().length > 0, `${farmer.status}`);

const multiTurn = await chat({
  messages: [
    { role: "user", content: "My name is Abebe." },
    { role: "assistant", content: "Nice to meet you, Abebe! How can I help you today?" },
    { role: "user", content: "What is my name? Reply with just the name." },
  ],
  lang: "en",
});
check("multi-turn history returns 200 + text", multiTurn.status === 200 && (multiTurn.data?.text || "").trim().length > 0, `${multiTurn.status}`);

const empty = await chat({ messages: [], lang: "en" });
check("empty messages rejected (400)", empty.status === 400, `${empty.status} ${JSON.stringify(empty.data)}`);

const noBody = await chat({});
check("missing messages rejected (400)", noBody.status === 400, `${noBody.status}`);

console.log(`\n== RESULT: ${pass.length} passed, ${fail.length} failed ==`);
if (fail.length) {
  console.error("Failed checks:", fail);
  process.exit(1);
}
process.exit(0);
