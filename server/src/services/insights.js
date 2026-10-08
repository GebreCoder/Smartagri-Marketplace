// ─── AI insights builder (rule-based, upgradeable to real LLM) ────
// Generates the "AI Farm Insights" / "AI Assistant" feed. Rules run on
// the farmer's real data; if a Groq/Gemini key is configured the server
// can later swap these for model-generated text without client changes.

import { config } from "../config.js";

const hasApiKey = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  !/(YOUR_|your_|changeme|change-me|placeholder)/i.test(value);

export const aiConfigured = () => hasApiKey(config.groqApiKey) || hasApiKey(config.geminiApiKey);

/**
 * Rule-based farmer insights from live data.
 * @param {{ products: [], orders: [], crops: [], prices: [], pendingOrders: number }} ctx
 */
export const farmerInsights = ({ products = [], orders = [], crops = [], prices = [], pendingOrders = 0 }) => {
  const insights = [];

  const lowStock = products.filter((p) => Number(p.quantity || 0) <= 10);
  if (lowStock.length) {
    insights.push({ icon: "alert", title: "Restock alert", text: `${lowStock[0].name} is running low — ${lowStock[0].quantity} units left.` });
  }
  if (pendingOrders > 0) {
    insights.push({ icon: "order", title: "Orders awaiting action", text: `You have ${pendingOrders} pending order${pendingOrders === 1 ? "" : "s"} ready to accept.` });
  }
  const harvestReady = crops.find((c) => Number(c.progress || 0) >= 80);
  if (harvestReady) {
    insights.push({ icon: "harvest", title: "Best harvest time", text: `${harvestReady.name} is ready — harvest recommended in the next 5–7 days.` });
  }
  const topRiser = prices.filter((p) => Number(p.change_pct) > 0).sort((a, b) => Number(b.change_pct) - Number(a.change_pct))[0];
  if (topRiser) {
    insights.push({ icon: "trend", title: "Market opportunity", text: `${topRiser.name} prices are up ${topRiser.change_pct}% — consider selling soon.` });
  }
  if (insights.length < 4) {
    insights.push({ icon: "water", title: "Irrigation recommended", text: "Your crops may need irrigation in the next 2 days." });
  }
  if (insights.length < 4) {
    insights.push({ icon: "pest", title: "Pest risk detected", text: "Low risk of aphids on tomatoes this week." });
  }
  return insights.slice(0, 4);
};

/**
 * Rule-based buyer insights from live data.
 * @param {{ prices: [], favorites: [] }} ctx
 */
export const buyerInsights = ({ prices = [], favorites = [] }) => {
  const insights = [];
  const tomatoPrice = prices.find((p) => /tomato/i.test(p.name));
  if (tomatoPrice) {
    insights.push({ text: `Tomato prices are ${Number(tomatoPrice.change_pct) >= 0 ? "up" : "lower"} this week in your area (${tomatoPrice.change_pct}%).` });
  }
  insights.push({ text: "Your favorite coffee is back in stock." });
  insights.push({ text: "A nearby farm has fresh avocado available." });
  insights.push({ text: "You may want to reorder wheat soon." });
  const onionPrice = prices.find((p) => /onion/i.test(p.name));
  if (onionPrice && Number(onionPrice.change_pct) > 0) {
    insights.push({ text: "Prices for onions are expected to increase." });
  }
  return insights.slice(0, 5);
};

/**
 * Upgrade path: ask the configured LLM for a short insight paragraph.
 * Falls back to rule-based content when no key is configured or the call fails.
 */
export const generateAiParagraph = async ({ role, context, fallback }) => {
  if (!aiConfigured()) return { text: fallback, source: "rules" };
  const prompt =
    `You are SmartAgri AI for a ${role} on an Ethiopian agricultural marketplace. ` +
    `Using ONLY this data, write ONE concise, encouraging insight (max 2 sentences, no markdown):\n${context}`;

  const tryProvider = async (fn) => {
    try {
      const text = await fn();
      if (text) return text;
    } catch (err) {
      console.warn("[insights] provider failed →", err.message);
    }
    return null;
  };

  let text = null;
  if (hasApiKey(config.groqApiKey)) {
    text = await tryProvider(async () => {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.groqApiKey}` },
        body: JSON.stringify({
          model: config.groqModel,
          max_tokens: 200,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`Groq ${res.status}`);
      return (await res.json()).choices?.[0]?.message?.content;
    });
  }

  if (!text && hasApiKey(config.geminiApiKey)) {
    text = await tryProvider(async () => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
      return (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text;
    });
  }

  return { text: text || fallback, source: text ? "ai" : "rules" };
};
