import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../Icon.jsx";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { getSocket } from "../socket.js";

const EMOJI = [
  "😀", "😂", "😊", "😍", "🥰", "😎", "🤔", "😅", "😭", "😡",
  "👍", "👎", "🙏", "👏", "💪", "🤝", "🌾", "🌱", "🌽", "🥕",
  "🍅", "🥔", "🧅", "🍎", "🥑", "🌻", "☀️", "🌧️", "☁️", "💧",
  "🚜", "🐄", "🐔", "🐑", "💰", "📦", "🛒", "❤️", "🎉", "✅",
];

const getInitials = (name) =>
  String(name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const fmtTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
};

const fmtDay = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
};

/** Highlight the query inside a message with <mark>. */
const Highlight = ({ text, query }) => {
  if (!query) return text;
  const lower = String(text).toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="msg-match">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
};

export default function Messenger() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const selfId = String(user?.id || "");

  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("chats"); // 'chats' | 'contacts'
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [mobileThread, setMobileThread] = useState(false);
  const [onlineIds, setOnlineIds] = useState(() => new Set());
  const [typingUserId, setTypingUserId] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [readReceipts, setReadReceipts] = useState(() => (user?.read_receipts !== false));
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const typingTimerRef = useRef(null);
  const lastTypingRef = useRef(0);

  const myRole = String(user?.role || "").toLowerCase().split("_")[0];
  const contactRole = myRole === "farmer" ? "buyer" : myRole === "buyer" ? "farmer" : "all";

  const loadConversations = useCallback(async () => {
    try {
      const { conversations: data } = await api.get("/api/chat/direct");
      setConversations(data || []);
    } catch {
      setConversations([]);
    }
  }, []);

  const loadContacts = useCallback(async () => {
    try {
      const { users: data } = await api.get(`/api/chat/users?role=${contactRole}`);
      setContacts(data || []);
    } catch {
      setContacts([]);
    }
  }, [contactRole]);

  const loadThread = useCallback(async (conversationId) => {
    if (!conversationId) return;
    try {
      const data = await api.get(`/api/chat/direct/${conversationId}`);
      setThread(data);
    } catch {
      setThread(null);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadConversations(), loadContacts()]).finally(() => setLoading(false));
  }, [loadConversations, loadContacts]);

  // Deep-link support: ?conversation=<id> opens a chat, ?userId=<id> starts one.
  useEffect(() => {
    const target = searchParams.get("conversation");
    const targetUser = searchParams.get("userId");
    (async () => {
      if (target) {
        setActiveConvId(target);
        setMobileThread(true);
      } else if (targetUser) {
        try {
          const { conversation } = await api.post("/api/chat/direct", { userId: targetUser });
          setActiveConvId(conversation.id);
          setMobileThread(true);
          await loadConversations();
        } catch (err) {
          alert(err.message || "Could not start the conversation.");
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTypingUserId(null);
    setEmojiOpen(false);
    if (!activeConvId) {
      setThread(null);
      return;
    }
    loadThread(activeConvId);
  }, [activeConvId, loadThread]);

  // Realtime: new direct message refreshes list + open thread.
  useEffect(() => {
    const socket = getSocket();
    const onMessageNew = (payload) => {
      loadConversations();
      if (String(payload.conversationId) === String(activeConvId)) {
        loadThread(activeConvId);
      }
    };
    socket.on("message:new", onMessageNew);
    return () => {
      socket.off("message:new", onMessageNew);
    };
  }, [activeConvId, loadConversations, loadThread]);

  // Online presence — live updates from the socket, seeded from server snapshots.
  useEffect(() => {
    const socket = getSocket();
    const onPresence = ({ userId, online }) => {
      setOnlineIds((prev) => {
        const next = new Set(prev);
        if (online) next.add(String(userId));
        else next.delete(String(userId));
        return next;
      });
    };
    socket.on("presence:update", onPresence);
    return () => {
      socket.off("presence:update", onPresence);
    };
  }, []);

  // Merge the server-provided online snapshots into the live set.
  useEffect(() => {
    setOnlineIds((prev) => {
      const next = new Set(prev);
      conversations.forEach((c) => {
        if (c.partner?.online) next.add(String(c.partner.id));
        else next.delete(String(c.partner.id));
      });
      contacts.forEach((c) => {
        if (c.online) next.add(String(c.id));
        else next.delete(String(c.id));
      });
      return next;
    });
  }, [conversations, contacts]);

  // Typing indicators for the active conversation.
  useEffect(() => {
    const socket = getSocket();
    const onStart = (payload) => {
      if (String(payload.conversationId) === String(activeConvId)) {
        setTypingUserId(String(payload.userId));
      }
    };
    const onStop = (payload) => {
      if (String(payload.conversationId) === String(activeConvId)) {
        setTypingUserId(null);
      }
    };
    socket.on("typing:start", onStart);
    socket.on("typing:stop", onStop);
    return () => {
      socket.off("typing:start", onStart);
      socket.off("typing:stop", onStop);
    };
  }, [activeConvId]);

  // Join/leave the active conversation room for live delivery.
  useEffect(() => {
    if (!activeConvId) return undefined;
    const socket = getSocket();
    socket.emit("join-conversation", activeConvId);
    return () => {
      socket.emit("leave-conversation", activeConvId);
    };
  }, [activeConvId]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread?.messages?.length]);

  // Close the thread menu or emoji panel on outside click / Escape.
  const emojiWrapRef = useRef(null);
  useEffect(() => {
    if (!menuOpen && !emojiOpen) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
      if (emojiWrapRef.current && !emojiWrapRef.current.contains(event.target)) setEmojiOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setEmojiOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, emojiOpen]);

  const startConversation = async (contact) => {
    try {
      const { conversation } = await api.post("/api/chat/direct", { userId: contact.id });
      setActiveConvId(conversation.id);
      setTab("chats");
      setMobileThread(true);
      await loadConversations();
      setTimeout(() => inputRef.current?.focus(), 80);
    } catch (err) {
      alert(err.message || "Could not start the conversation.");
    }
  };

  const openConversation = (conversation) => {
    setActiveConvId(conversation.id);
    setMobileThread(true);
  };

  const emitTyping = () => {
    if (!activeConvId) return;
    const socket = getSocket();
    const now = Date.now();
    if (now - lastTypingRef.current > 2500) {
      lastTypingRef.current = now;
      socket.emit("typing", activeConvId);
    }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socket.emit("typing:stop", activeConvId);
    }, 3000);
  };

  const stopTyping = () => {
    clearTimeout(typingTimerRef.current);
    if (activeConvId) getSocket().emit("typing:stop", activeConvId);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || !activeConvId || sending) return;
    setSending(true);
    try {
      stopTyping();
      await api.post(`/api/chat/direct/${activeConvId}/messages`, { message: text });
      setMessage("");
      setEmojiOpen(false);
      await Promise.all([loadConversations(), loadThread(activeConvId)]);
    } catch (err) {
      alert(err.message || "Could not send the message.");
    } finally {
      setSending(false);
    }
  };

  const toggleReadReceipts = async () => {
    const next = !readReceipts;
    setReadReceipts(next);
    setMenuOpen(false);
    try {
      await api.patch("/api/users/me", { readReceipts: next });
    } catch {
      setReadReceipts(!next); // revert on failure
    }
  };

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.partner?.full_name?.toLowerCase().includes(q));
  }, [conversations, search]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.full_name?.toLowerCase().includes(q) ||
        c.location?.toLowerCase().includes(q) ||
        c.role?.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const activePartner = thread?.partner || conversations.find((c) => c.id === activeConvId)?.partner || null;
  const messages = thread?.messages || [];

  // Message search within the open thread.
  const searchMatches = useMemo(() => {
    const q = threadSearch.trim().toLowerCase();
    if (!q) return [];
    return messages.map((m, i) => ({ m, i })).filter(({ m }) => m.message.toLowerCase().includes(q));
  }, [messages, threadSearch]);

  // Scroll to the current search match (declared after searchMatches).
  useEffect(() => {
    if (!searchMatches.length) return;
    const safeIndex = Math.min(searchIndex, searchMatches.length - 1);
    const el = document.getElementById(`msg-${searchMatches[safeIndex]?.m.id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [searchIndex, searchMatches]);

  const stepSearch = (delta) => {
    if (!searchMatches.length) return;
    setSearchIndex((prev) => (prev + delta + searchMatches.length) % searchMatches.length);
  };

  const backToList = () => setMobileThread(false);
  const isPartnerOnline = activePartner ? onlineIds.has(String(activePartner.id)) : false;
  const isTyping = typingUserId && String(typingUserId) !== selfId && String(typingUserId) === String(activePartner?.id);

  return (
    <div className="msg-app">
      {/* ── Left pane: conversations / contacts ── */}
      <aside className={`msg-side${mobileThread ? " hidden" : ""}`}>
        <div className="msg-side-head">
          <div className="msg-title">Messages</div>
          <div className="msg-tabs">
            <button className={`msg-tab${tab === "chats" ? " active" : ""}`} onClick={() => setTab("chats")}>
              <Icon name="chatbubbles-outline" size={14} /> Chats
            </button>
            <button className={`msg-tab${tab === "contacts" ? " active" : ""}`} onClick={() => setTab("contacts")}>
              <Icon name="people-outline" size={14} /> Contacts
            </button>
          </div>
          <div className="msg-search">
            <Icon name="search-outline" size={15} color="#94A3B8" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === "chats" ? "Search conversations..." : `Search ${contactRole === "all" ? "users" : contactRole + "s"}...`}
              aria-label="Search"
            />
          </div>
        </div>

        <div className="msg-list">
          {loading ? (
            <div className="msg-empty"><Spinner size={20} /> <span>Loading…</span></div>
          ) : tab === "chats" ? (
            filteredConversations.length ? (
              filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  className={`msg-item${conv.id === activeConvId ? " active" : ""}`}
                  onClick={() => openConversation(conv)}
                >
                  <span className="msg-avatar">
                    {conv.partner?.image_url ? (
                      <img src={conv.partner.image_url} alt={conv.partner.full_name} />
                    ) : (
                      <span className="msg-avatar-init">{getInitials(conv.partner?.full_name)}</span>
                    )}
                    {onlineIds.has(String(conv.partner?.id)) && <span className="msg-online-dot" />}
                  </span>
                  <span className="msg-item-body">
                    <span className="msg-item-top">
                      <span className="msg-item-name">{conv.partner?.full_name}</span>
                      <span className="msg-item-time">{conv.time}</span>
                    </span>
                    <span className="msg-item-bottom">
                      <span className="msg-item-last">{conv.lastMessage || "Start the conversation…"}</span>
                      {Number(conv.unread) > 0 && <span className="msg-unread">{conv.unread}</span>}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <div className="msg-empty">
                <Icon name="chatbubbles-outline" size={30} color="#94A3B8" />
                <p>No conversations yet.</p>
                <button className="d2-btn-primary-sm" onClick={() => setTab("contacts")}>Find people to chat with</button>
              </div>
            )
          ) : filteredContacts.length ? (
            filteredContacts.map((contact) => (
              <button key={contact.id} className="msg-item" onClick={() => startConversation(contact)}>
                <span className="msg-avatar">
                  {contact.image_url ? (
                    <img src={contact.image_url} alt={contact.full_name} />
                  ) : (
                    <span className="msg-avatar-init">{getInitials(contact.full_name)}</span>
                  )}
                  {onlineIds.has(String(contact.id)) && <span className="msg-online-dot" />}
                </span>
                <span className="msg-item-body">
                  <span className="msg-item-top">
                    <span className="msg-item-name">{contact.full_name}</span>
                    <span className={`msg-role-pill ${contact.role}`}>{contact.role}</span>
                  </span>
                  <span className="msg-item-bottom">
                    <span className="msg-item-last">
                      <Icon name="location-outline" size={11} /> {contact.location || "Ethiopia"}
                    </span>
                    <Icon name="chatbubble-ellipses-outline" size={15} color="#16A34A" />
                  </span>
                </span>
              </button>
            ))
          ) : (
            <div className="msg-empty">
              <Icon name="people-outline" size={30} color="#94A3B8" />
              <p>No {contactRole === "all" ? "users" : contactRole + "s"} found.</p>
            </div>
          )}
        </div>
      </aside>

      {/* ── Right pane: thread ── */}
      <section className={`msg-thread${mobileThread ? " visible" : ""}`}>
        {activeConvId && activePartner ? (
          <>
            <div className="msg-thread-head">
              <button className="msg-back" onClick={backToList} aria-label="Back to conversations">
                <Icon name="arrow-back-outline" size={18} />
              </button>
              <span className="msg-avatar msg-avatar-lg">
                {activePartner.image_url ? (
                  <img src={activePartner.image_url} alt={activePartner.full_name} />
                ) : (
                  <span className="msg-avatar-init">{getInitials(activePartner.full_name)}</span>
                )}
                {isPartnerOnline && <span className="msg-online-dot" />}
              </span>
              <div className="grow">
                <div className="msg-thread-name">{activePartner.full_name}</div>
                <div className="msg-thread-sub">
                  {isTyping ? (
                    <span className="msg-typing">typing<span className="msg-typing-dots">…</span></span>
                  ) : (
                    <>
                      <span className={`msg-role-dot ${activePartner.role}${isPartnerOnline ? " online" : ""}`} />
                      {isPartnerOnline ? "Online" : `${activePartner.role === "farmer" ? "Farmer" : "Buyer"} · ${activePartner.location || "Ethiopia"}`}
                    </>
                  )}
                </div>
              </div>
              <button
                className="msg-thread-action"
                onClick={() => setThreadSearchOpen((v) => !v)}
                aria-label="Search in conversation"
                title="Search in conversation"
              >
                <Icon name="search-outline" size={18} />
              </button>
              <div className="msg-thread-menu-wrap" ref={menuRef}>
                <button className="msg-thread-action" onClick={() => setMenuOpen((v) => !v)} aria-label="Conversation options">
                  <Icon name="ellipsis-vertical-outline" size={18} />
                </button>
                {menuOpen && (
                  <div className="msg-thread-menu">
                    <button onClick={toggleReadReceipts}>
                      <Icon
                        name={readReceipts ? "checkmark-circle-outline" : "ellipsis-horizontal-outline"}
                        size={15}
                        color={readReceipts ? "#16A34A" : "#94A3B8"}
                      />
                      Read receipts: {readReceipts ? "On" : "Off"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {threadSearchOpen && (
              <div className="msg-search-bar">
                <Icon name="search-outline" size={14} color="#94A3B8" />
                <input
                  value={threadSearch}
                  onChange={(e) => { setThreadSearch(e.target.value); setSearchIndex(0); }}
                  placeholder="Search in conversation…"
                  aria-label="Search in conversation"
                  autoFocus
                />
                {searchMatches.length > 0 && (
                  <span className="msg-search-count">{searchIndex + 1}/{searchMatches.length}</span>
                )}
                <button onClick={() => stepSearch(-1)} aria-label="Previous match" disabled={!searchMatches.length}>
                  <Icon name="chevron-up-outline" size={14} />
                </button>
                <button onClick={() => stepSearch(1)} aria-label="Next match" disabled={!searchMatches.length}>
                  <Icon name="chevron-down-outline" size={14} />
                </button>
                <button onClick={() => { setThreadSearchOpen(false); setThreadSearch(""); }} aria-label="Close search">
                  <Icon name="close-outline" size={15} />
                </button>
              </div>
            )}

            <div className="msg-thread-body">
              {messages.map((msg, index) => {
                const isOut = String(msg.sender_id) === selfId;
                const prev = messages[index - 1];
                const showDay = !prev || fmtDay(prev.created_at) !== fmtDay(msg.created_at);
                return (
                  <div key={msg.id} id={`msg-${msg.id}`}>
                    {showDay && <div className="msg-day-divider">{fmtDay(msg.created_at)}</div>}
                    <div className={`msg-bubble-wrap ${isOut ? "out" : "in"}`}>
                      <div className={`msg-bubble${isOut ? " out" : ""}`}>
                        <div className="msg-bubble-text">
                          <Highlight text={msg.message} query={threadSearchOpen ? threadSearch : ""} />
                        </div>
                        <div className="msg-bubble-meta">
                          {fmtTime(msg.created_at)}
                          {isOut && (
                            <Icon
                              name={msg.is_read ? "checkmark-done-outline" : "checkmark-outline"}
                              size={13}
                              color={msg.is_read ? "#16A34A" : "#94A3B8"}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form className="msg-composer" onSubmit={sendMessage}>
              <div className="msg-emoji-wrap" ref={emojiWrapRef}>
                <button
                  type="button"
                  className={`msg-emoji-btn${emojiOpen ? " active" : ""}`}
                  onClick={() => setEmojiOpen((v) => !v)}
                  aria-label="Emoji"
                >
                  <Icon name="happy-outline" size={19} />
                </button>
                {emojiOpen && (
                  <div className="msg-emoji-panel">
                    {EMOJI.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          setMessage((m) => m + emoji);
                          inputRef.current?.focus();
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="msg-input-wrap">
                <input
                  ref={inputRef}
                  className="msg-input"
                  value={message}
                  onChange={(e) => { setMessage(e.target.value); emitTyping(); }}
                  placeholder="Type a message…"
                  aria-label="Message"
                />
              </div>
              <button className="msg-send" type="submit" disabled={!message.trim() || sending} aria-label="Send message">
                {sending ? <Spinner light size={17} /> : <Icon name="send" size={17} />}
              </button>
            </form>
          </>
        ) : (
          <div className="msg-thread-empty">
            <span className="msg-thread-empty-icon">
              <Icon name="chatbubbles-outline" size={40} color="#16A34A" />
            </span>
            <div className="msg-thread-empty-title">AgriSpark Messenger</div>
            <p>
              Select a conversation on the left, or open <strong>Contacts</strong> to chat with any registered
              {myRole === "farmer" ? " buyer" : myRole === "buyer" ? " farmer" : " user"}.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
