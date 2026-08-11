import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../Icon.jsx";
import { api } from "../api.js";
import {
  GREETING_FLOWS,
  ROLE_LABELS,
  ROLE_FOLLOWUP,
  ROLE_QUICK,
  DASHBOARD_GREETINGS,
  PRICES,
  CAT_EMOJI,
  CAT_COLOR,
  CATS,
  trendColor,
  LANGS,
  UI,
  QUICK_LABEL,
} from "../data/agriSparkData.js";
import "../styles/chatbot.css";

const nowTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function BoldText({ text }) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

function MessageBubble({ role, content, timestamp }) {
  const isUser = role === "user";
  return (
    <div className={`chatb-row ${isUser ? "chatb-row-user" : ""}`}>
      <div className={`chatb-mark ${isUser ? "chatb-mark-user" : ""}`}>
        <Icon name={isUser ? "person" : "leaf"} size={12} color={isUser ? "#1E7A35" : "#fff"} />
      </div>
      <div className={`chatb-bubble ${isUser ? "chatb-bubble-user" : "chatb-bubble-assistant"}`}>
        {!isUser && (
          <div className="chatb-ai-tag">
            <Icon name="sparkles" size={11} color="#175E31" />
            <span>AgriSpark AI</span>
          </div>
        )}
        <BoldText text={content} />
        {timestamp && <div className="chatb-time">{timestamp}</div>}
      </div>
    </div>
  );
}

export default function AiChatbot({ autoGreeting = true, dashboardRole = null, dashboardPage = null, onClose }) {
  const [lang, setLang] = useState("en");
  const [tab, setTab] = useState("chat");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiSource, setApiSource] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [catFilter, setCatFilter] = useState("All");
  const [greetingDone, setGreetingDone] = useState(false);
  const [typingStep, setTypingStep] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [systemContext, setSystemContext] = useState(null);

  const scrollRef = useRef(null);
  const greetingFired = useRef(false);
  const mountedRef = useRef(false);
  const timersRef = useRef([]);

  const t = UI[lang] ?? UI.en;
  const roleLocked = ["buyer", "farmer", "admin"].includes(dashboardRole);
  const pageLabel = typeof dashboardPage === "string" && dashboardPage.trim() ? dashboardPage.trim() : null;

  const clearTimers = () => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  const addMsg = useCallback((role, content, extra = {}) => {
    const id = `${role[0]}-${Date.now()}-${Math.random()}`;
    setMessages((prev) => [...prev, { id, role, content, ts: nowTime(), ...extra }]);
  }, []);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 60);
  };

  // ── Greeting sequence ────────────────────────────────────────────
  const runGreeting = useCallback(() => {
    if (greetingFired.current) return;
    greetingFired.current = true;

    if (roleLocked) {
      const langGreetings = DASHBOARD_GREETINGS[lang] ?? DASHBOARD_GREETINGS.en;
      const greetText = langGreetings[dashboardRole] ?? langGreetings.buyer;
      setTypingStep(0);
      timersRef.current.push(
        setTimeout(() => {
          setTypingStep(null);
          addMsg("assistant", pageLabel ? `${greetText} You are on the ${pageLabel}.` : greetText);
          setUserRole(dashboardRole);
          setGreetingDone(true);
          setShowRolePicker(false);
          timersRef.current.push(setTimeout(() => setShowSuggestions(true), 350));
        }, 700)
      );
      return;
    }

    const steps = GREETING_FLOWS[lang] ?? GREETING_FLOWS.en;
    let elapsed = 400;
    steps.forEach((step, idx) => {
      const typingStart = elapsed;
      elapsed += step.typing;
      const msgStart = elapsed;
      elapsed += step.delay;
      timersRef.current.push(setTimeout(() => setTypingStep(idx), typingStart));
      timersRef.current.push(
        setTimeout(() => {
          setTypingStep(null);
          addMsg("assistant", step.text);
          if (step.showRoles) {
            timersRef.current.push(setTimeout(() => setShowRolePicker(true), 300));
          }
          if (idx === steps.length - 1 && !step.showRoles) {
            timersRef.current.push(setTimeout(() => {
              setGreetingDone(true);
              setShowSuggestions(true);
            }, 400));
          }
        }, msgStart)
      );
    });
  }, [lang, addMsg, roleLocked, dashboardRole, pageLabel]);

  useEffect(() => {
    if (autoGreeting) runGreeting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Language changed — reset conversation state and re-greet
    clearTimers();
    setMessages([]);
    setInput("");
    setApiError(null);
    setGreetingDone(false);
    setShowRolePicker(false);
    setShowSuggestions(false);
    setUserRole(null);
    setTypingStep(null);

    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    greetingFired.current = false;
    if (autoGreeting) timersRef.current.push(setTimeout(runGreeting, 200));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, typingStep, showRolePicker, showSuggestions]);

  const handleRolePick = useCallback(
    (role) => {
      setUserRole(role);
      setShowRolePicker(false);
      const followup = (ROLE_FOLLOWUP[lang] ?? ROLE_FOLLOWUP.en)[role];
      const roleLabels = ROLE_LABELS[lang] ?? ROLE_LABELS.en;
      addMsg("user", roleLabels[role]);
      setTypingStep("role");
      timersRef.current.push(
        setTimeout(() => {
          setTypingStep(null);
          addMsg("assistant", followup);
          setGreetingDone(true);
          timersRef.current.push(setTimeout(() => setShowSuggestions(true), 300));
        }, 900)
      );
    },
    [lang, addMsg]
  );

  // ── Send message via the Express AI proxy ─────────────────────────
  const send = useCallback(
    async (text) => {
      const trimmed = (text ?? input).trim();
      if (!trimmed || loading || showRolePicker) return;
      setShowSuggestions(false);
      addMsg("user", trimmed);
      setInput("");
      setLoading(true);
      setApiError(null);
      try {
        const history = [...messages, { role: "user", content: trimmed }].map((m) => ({
          role: m.role,
          content: m.content,
        }));
        const data = await api.post("/api/ai/chat", {
          messages: history,
          lang,
          role: userRole,
          systemContext,
        });
        addMsg("assistant", data.text);
        setApiSource(data.source);
        timersRef.current.push(setTimeout(() => setShowSuggestions(true), 600));
      } catch (err) {
        addMsg("assistant", "⚠️ I couldn't reach the server. Please check your API keys and try again.");
        setApiError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, lang, userRole, systemContext, showRolePicker, addMsg]
  );

  const roleQuick = ROLE_QUICK[lang] ?? ROLE_QUICK.en;
  const currentSuggestions = roleQuick[userRole ?? "both"] ?? roleQuick.both ?? [];
  const filtered = PRICES.filter((p) => catFilter === "All" || p.cat === catFilter);

  const chatItems = [
    ...messages.map((m) => ({ type: "msg", data: m })),
    ...(typingStep !== null || loading ? [{ type: "typing" }] : []),
    ...(showRolePicker && !loading ? [{ type: "roles" }] : []),
    ...(showSuggestions && greetingDone && !loading && !showRolePicker ? [{ type: "suggestions" }] : []),
    ...(apiError ? [{ type: "error" }] : []),
  ];

  return (
    <div className="chatb">
      {/* ── Header ── */}
      <div className="chatb-header">
        <div className="chatb-title-row">
          <div className="chatb-logo">
            <Icon name="leaf" size={16} color="#fff" />
          </div>
          <div className="grow">
            <div className="chatb-title">AgriSpark AI</div>
            <div className="chatb-tagline-row">
              <span className="chatb-dot" />
              <span className="chatb-tagline">{t.tagline}</span>
            </div>
          </div>
          {apiSource && <span className="chatb-source">via {apiSource}</span>}
          {userRole && (
            <span className="chatb-role-badge">
              {userRole === "buyer" ? "🛒 Buyer" : userRole === "farmer" ? "🌾 Farmer" : userRole === "admin" ? "🛡️ Admin" : "👁️ Browsing"}
            </span>
          )}
          {onClose && (
            <button className="chatb-close" onClick={onClose} aria-label="Close chatbot">
              <Icon name="close" size={20} color="#15351F" />
            </button>
          )}
        </div>

        <div className="chatb-langs">
          {LANGS.map((l) => (
            <button
              key={l.code}
              className={`chatb-lang ${lang === l.code ? "chatb-lang-active" : ""}`}
              onClick={() => setLang(l.code)}
            >
              {l.flag} {l.label}
            </button>
          ))}
        </div>

        <div className="chatb-tabs">
          {[
            { id: "chat", label: t.chatTab },
            { id: "prices", label: t.pricesTab },
          ].map((tb) => (
            <button
              key={tb.id}
              className={`chatb-tab ${tab === tb.id ? "chatb-tab-active" : ""}`}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CHAT TAB ── */}
      {tab === "chat" && (
        <>
          <div className="chatb-messages" ref={scrollRef}>
            {chatItems.map((item, index) => {
              if (item.type === "msg") {
                return <MessageBubble key={item.data.id} role={item.data.role} content={item.data.content} timestamp={item.data.ts} />;
              }
              if (item.type === "typing") {
                return (
                  <div className="chatb-row" key={`typing-${index}`}>
                    <div className="chatb-mark">
                      <Icon name="leaf" size={12} color="#fff" />
                    </div>
                    <div className="chatb-typing-bubble">
                      <span className="chatb-typing-dot" />
                      <span className="chatb-typing-dot" />
                      <span className="chatb-typing-dot" />
                    </div>
                  </div>
                );
              }
              if (item.type === "roles") {
                const labels = ROLE_LABELS[lang] ?? ROLE_LABELS.en;
                const options = [
                  { key: "buyer", label: labels.buyer, bg: "#F4FBF7", border: "#BBF7D0" },
                  { key: "farmer", label: labels.farmer, bg: "#FFF9E8", border: "#F7D774" },
                  { key: "both", label: labels.both, bg: "#F2FAFF", border: "#C7E7FF" },
                ];
                return (
                  <div className="chatb-roles" key={`roles-${index}`}>
                    {options.map((o) => (
                      <button
                        key={o.key}
                        className="chatb-role-btn"
                        style={{ background: o.bg, borderColor: o.border }}
                        onClick={() => handleRolePick(o.key)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                );
              }
              if (item.type === "suggestions") {
                return (
                  <div className="chatb-suggestions" key={`sug-${index}`}>
                    <div className="chatb-sug-label">{QUICK_LABEL[lang] ?? QUICK_LABEL.en}</div>
                    {currentSuggestions.map((q, qi) => (
                      <button key={qi} className="chatb-sug-btn" onClick={() => send(q.label)}>
                        <span>{q.icon}</span> {q.label}
                      </button>
                    ))}
                  </div>
                );
              }
              if (item.type === "error") {
                return (
                  <div className="chatb-error" key={`err-${index}`}>
                    <strong>Debug: </strong>
                    {apiError}
                  </div>
                );
              }
              return null;
            })}
          </div>

          <div className="chatb-inputbar">
            <div className={`chatb-input-wrap ${input ? "chatb-input-active" : ""}`}>
              <input
                className="chatb-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                placeholder={showRolePicker ? "Choose your role above first…" : t.placeholder}
                disabled={loading || typingStep !== null}
              />
              <button
                className={`chatb-send ${input.trim() && !loading ? "chatb-send-active" : ""}`}
                onClick={() => send()}
                disabled={!input.trim() || loading || typingStep !== null}
                aria-label="Send"
              >
                {loading ? <span className="spinner spinner-light" style={{ width: 16, height: 16 }} /> : "↑"}
              </button>
            </div>
            <div className="chatb-footer">{t.footer}</div>
          </div>
        </>
      )}

      {/* ── PRICES TAB ── */}
      {tab === "prices" && (
        <div className="chatb-prices">
          <div className="chatb-market">
            <div className="chatb-market-title">{t.marketTitle}</div>
            <div className="chatb-market-grid">
              {[
                { label: "USD / ETB", value: "~125 ETB" },
                { label: "Inflation 2025", value: "~25%" },
                { label: "Teff/100kg", value: "10,500–11,750" },
                { label: "Korarima/kg", value: "600–1,000 ETB" },
              ].map((s) => (
                <div key={s.label} className="chatb-market-card">
                  <div className="chatb-market-label">{s.label}</div>
                  <div className="chatb-market-value">{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="chatb-cat-filter">
            {CATS.map((c) => (
              <button
                key={c}
                className={`chatb-cat ${catFilter === c ? "chatb-cat-active" : ""}`}
                onClick={() => setCatFilter(c)}
              >
                {c === "All" ? t.filterAll : `${CAT_EMOJI[c]} ${c}`}
              </button>
            ))}
          </div>

          <div className="chatb-price-list">
            {filtered.map((item) => {
              const clr = CAT_COLOR[item.cat];
              return (
                <div key={item.key} className="chatb-price-card">
                  <div className="chatb-price-icon" style={{ background: clr.bg, borderColor: `${clr.accent}22` }}>
                    {CAT_EMOJI[item.cat]}
                  </div>
                  <div className="grow">
                    <div className="chatb-price-name">{item.name}</div>
                    <div className="chatb-price-sub">
                      {item.am} · {t.perUnit} {item.unit}
                    </div>
                  </div>
                  <div className="chatb-price-right">
                    <div className="chatb-price-range">
                      {item.low.toLocaleString()}–{item.high.toLocaleString()}
                    </div>
                    <div className="chatb-price-trend" style={{ color: trendColor(item.trend) }}>
                      ETB {item.trend}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="chatb-disclaimer">{t.disclaimer}</div>

          <button
            className="chatb-ask-ai"
            onClick={() => {
              setTab("chat");
              timersRef.current.push(setTimeout(() => send(currentSuggestions[2]?.label ?? "What are teff prices today?"), 100));
            }}
          >
            <span className="chatb-ask-ai-icon">
              <Icon name="sparkles" size={18} color="#fff" />
            </span>
            <span className="grow">
              <div className="chatb-ask-ai-title">{t.askAI}</div>
              <div className="chatb-ask-ai-sub">Get help with prices, orders, and farmers</div>
            </span>
            <Icon name="arrow-forward" size={15} color="#fff" />
          </button>
        </div>
      )}
    </div>
  );
}
