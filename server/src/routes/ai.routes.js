import { Router } from "express";
import { asyncHandler } from "../middleware/error.js";
import { config } from "../config.js";
import { buildSystemPrompt } from "../aiPrompt.js";

const router = Router();

const LANG_MAP = {
  en: "English",
  am: "Amharic (አማርኛ) using Ethiopic script",
  oro: "Afaan Oromo using Latin script",
  tig: "Tigrinya (ትግርኛ) using Ethiopic script",
};

const hasConfiguredApiKey = (value) => typeof value === "string" && value.trim().length > 0 && !value.includes("YOUR_");

// ── Groq (primary) ─────────────────────────────────────────────────
async function callGroq(msgs, lang, role, systemContext) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.groqApiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 900,
      messages: [
        { role: "system", content: buildSystemPrompt(`Always respond in ${LANG_MAP[lang] ?? "English"}.`, role) },
        ...(systemContext ? [{ role: "system", content: systemContext }] : []),
        ...msgs,
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq empty");
  return { text, source: "Groq" };
}

// ── Gemini (fallback) ──────────────────────────────────────────────
async function callGemini(msgs, lang, role, systemContext) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.geminiApiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [
          { text: buildSystemPrompt(`Always respond in ${LANG_MAP[lang] ?? "English"}.`, role) },
          ...(systemContext ? [{ text: systemContext }] : []),
        ],
      },
      contents: msgs.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: 900 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini empty");
  return { text, source: "Gemini" };
}

// ── POST /api/ai/chat ──────────────────────────────────────────────
// body: { messages: [{role, content}], lang, role, systemContext }
router.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const msgs = Array.isArray(req.body.messages) ? req.body.messages : [];
    const lang = String(req.body.lang || "en");
    const role = String(req.body.role || "").toLowerCase() || null;
    const systemContext = String(req.body.systemContext || "").trim() || null;

    if (!msgs.length) {
      return res.status(400).json({ message: "No messages provided." });
    }

    const groqMissing = !hasConfiguredApiKey(config.groqApiKey);
    const geminiMissing = !hasConfiguredApiKey(config.geminiApiKey);

    if (groqMissing && geminiMissing) {
      return res.status(503).json({
        message: "AI is not configured for this build yet. Add a Groq or Gemini key to the server .env file.",
      });
    }

    try {
      const result = await callGroq(msgs, lang, role, systemContext);
      return res.json(result);
    } catch (groqError) {
      console.warn("[ai] Groq failed →", groqError.message);
      if (geminiMissing) {
        return res.status(502).json({ message: `Groq failed and Gemini is not configured: ${groqError.message}` });
      }
      const result = await callGemini(msgs, lang, role, systemContext);
      return res.json(result);
    }
  })
);

export default router;
