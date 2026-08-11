import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Icon from "../Icon.jsx";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { getSocket } from "../socket.js";
import { Spinner } from "../components/Spinner.jsx";
import "./chatpage.css";

const initials = (name) =>
  String(name || "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const fmtTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { hour: "2-digit", minute: "2-digit" });
};

const fmtDay = (value) => {
  const date = new Date(value);
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
};

export default function ChatPage() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const role = searchParams.get("role") === "farmer" ? "farmer" : "buyer";
  const navigate = useNavigate();
  const { user } = useAuth();

  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [typingPartner, setTypingPartner] = useState(false);
  const bottomRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/api/chat/threads/${orderId}?role=${role}`);
      setThread(data);
    } catch (err) {
      setThread({ error: err.message || "Could not load this conversation." });
    } finally {
      setLoading(false);
    }
  }, [orderId, role]);

  useEffect(() => {
    load();
  }, [load]);

  // Join the order room and listen for live messages
  useEffect(() => {
    const socket = getSocket();
    socket.emit("join-order", orderId);

    const onMessageNew = (payload) => {
      if (String(payload.orderId) === String(orderId)) {
        setTypingPartner(false);
        load();
      }
    };
    const onCleared = (payload) => {
      if (String(payload.orderId) === String(orderId)) load();
    };
    socket.on("message:new", onMessageNew);
    socket.on("message:cleared", onCleared);

    return () => {
      socket.off("message:new", onMessageNew);
      socket.off("message:cleared", onCleared);
      socket.emit("leave-order", orderId);
    };
  }, [orderId, load]);

  // Auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread?.messages?.length, loading]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/chat/threads/${orderId}/messages`, {
        message,
        role,
        receiverId: thread?.participantId || "",
      });
      setMessage("");
      await load();
    } catch (err) {
      alert(err.message || "Could not send the message.");
    } finally {
      setSending(false);
    }
  };

  if (loading && !thread) {
    return (
      <div className="chatpage">
        <div className="chatpage-head">
          <div className="chatpage-back"><Icon name="arrow-back-outline" size={18} /></div>
          <div className="chatpage-avatar"><span>{initials("...")}</span></div>
          <div>
            <div className="chatpage-name">Loading…</div>
          </div>
        </div>
        <div className="chatpage-body">
          <div className="card card-pad"><Spinner size={18} /> <span className="muted small bold">Loading conversation…</span></div>
        </div>
      </div>
    );
  }

  if (thread?.error) {
    return (
      <div className="chatpage">
        <div className="chatpage-head">
          <button className="chatpage-back" onClick={() => navigate(role === "farmer" ? "/farmer/chat" : "/buyer/chat")}>
            <Icon name="arrow-back-outline" size={18} />
          </button>
          <div>
            <div className="chatpage-name">Conversation unavailable</div>
          </div>
        </div>
        <div className="empty-state">
          <Icon name="alert-circle-outline" size={34} color="#7A8E81" />
          <h3>{thread.error}</h3>
          <button className="btn btn-soft mt-2" onClick={() => navigate(role === "farmer" ? "/farmer/chat" : "/buyer/chat")}>
            Back to chats
          </button>
        </div>
      </div>
    );
  }

  const messages = thread?.messages || [];
  const canChat = thread?.canChat && user;
  const participantName = thread?.participantName || "Conversation";
  const avatarImage = role === "farmer" ? "" : thread?.farmer_image_url || thread?.product?.image_url;
  const backTo = role === "farmer" ? "/farmer/chat" : "/buyer/chat";

  return (
    <div className="chatpage">
      <div className="chatpage-head">
        <button className="chatpage-back" onClick={() => navigate(backTo)} aria-label="Back">
          <Icon name="arrow-back-outline" size={18} />
        </button>
        <div className="chatpage-avatar">
          {avatarImage ? <img src={avatarImage} alt={participantName} /> : <span>{initials(participantName)}</span>}
        </div>
        <div className="grow">
          <div className="chatpage-name">{participantName}</div>
          <div className="chatpage-sub">
            📦 {thread?.product?.name || "Product"} · {thread?.product?.location || "Ethiopia"}
          </div>
        </div>
        <span className={`pill ${thread?.canChat ? "pill-accepted" : "pill-pending"}`}>
          {thread?.canChat ? "Chat open" : "Awaiting acceptance"}
        </span>
      </div>

      <div className="chatpage-body">
        {messages.map((msg, index) => {
          const isIssue = String(msg.message || "").startsWith("Issue reported:");
          const isOut = String(msg.sender_id) === String(user?.id);
          const prev = messages[index - 1];
          const showDay = !prev || fmtDay(prev.created_at) !== fmtDay(msg.created_at);

          if (isIssue) {
            return (
              <div key={msg.id} className="chat-msg-issue">
                🚩 {msg.message}
              </div>
            );
          }

          return (
            <div key={msg.id}>
              {showDay && <div className="chat-day-divider">{fmtDay(msg.created_at)}</div>}
              <div className={`chat-msg ${isOut ? "chat-msg-out" : "chat-msg-in"}`}>
                <div>{msg.message}</div>
                <div className="chat-msg-time">{fmtTime(msg.created_at)}{isOut ? " · you" : ""}</div>
              </div>
            </div>
          );
        })}

        {typingPartner && (
          <div className="chat-typing">
            <span /><span /><span />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form className="chatpage-composer" onSubmit={sendMessage}>
        <div className="chatpage-input-wrap">
          <input
            className="chatpage-input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={canChat ? "Type a message…" : "Chat opens once the order is accepted"}
            disabled={!canChat}
          />
        </div>
        <button className="chatpage-send" type="submit" disabled={!canChat || !message.trim() || sending} aria-label="Send message">
          {sending ? <Spinner light size={17} /> : <Icon name="send" size={18} />}
        </button>
      </form>
    </div>
  );
}
