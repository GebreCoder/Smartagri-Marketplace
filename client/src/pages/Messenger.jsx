import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../Icon.jsx";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { getSocket } from "../socket.js";

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

export default function Messenger() {
  const navigate = useNavigate();
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
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

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

  useEffect(() => {
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

  const sendMessage = async (e) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || !activeConvId || sending) return;
    setSending(true);
    try {
      await api.post(`/api/chat/direct/${activeConvId}/messages`, { message: text });
      setMessage("");
      await Promise.all([loadConversations(), loadThread(activeConvId)]);
    } catch (err) {
      alert(err.message || "Could not send the message.");
    } finally {
      setSending(false);
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
  const backToList = () => setMobileThread(false);

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
              </span>
              <div className="grow">
                <div className="msg-thread-name">{activePartner.full_name}</div>
                <div className="msg-thread-sub">
                  <span className={`msg-role-dot ${activePartner.role}`} />
                  {activePartner.role === "farmer" ? "Farmer" : "Buyer"} · {activePartner.location || "Ethiopia"}
                </div>
              </div>
              <button className="msg-thread-action" onClick={() => navigate("/profile")} aria-label="View profile">
                <Icon name="ellipsis-vertical-outline" size={18} />
              </button>
            </div>

            <div className="msg-thread-body">
              {messages.map((msg, index) => {
                const isOut = String(msg.sender_id) === selfId;
                const prev = messages[index - 1];
                const showDay = !prev || fmtDay(prev.created_at) !== fmtDay(msg.created_at);
                return (
                  <div key={msg.id}>
                    {showDay && <div className="msg-day-divider">{fmtDay(msg.created_at)}</div>}
                    <div className={`msg-bubble-wrap ${isOut ? "out" : "in"}`}>
                      <div className={`msg-bubble${isOut ? " out" : ""}`}>
                        <div className="msg-bubble-text">{msg.message}</div>
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
              <div className="msg-input-wrap">
                <input
                  ref={inputRef}
                  className="msg-input"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
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
