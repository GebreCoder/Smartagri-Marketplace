import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import { Spinner } from "../../components/Spinner.jsx";
import { getSocket } from "../../socket.js";

const initials = (name) =>
  String(name || "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function ChatList() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { conversations: data } = await api.get("/api/chat/conversations?role=buyer");
      setConversations(data);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when a new message arrives
  useEffect(() => {
    const socket = getSocket();
    const onChange = () => load();
    socket.on("message:new", onChange);
    socket.on("order:changed", onChange);
    return () => {
      socket.off("message:new", onChange);
      socket.off("order:changed", onChange);
    };
  }, [load]);

  return (
    <div>
      <div className="buyer-heading">
        <h2>Conversations</h2>
        <span className="section-hint">Chat with farmers about accepted orders</span>
      </div>

      {loading ? (
        <div className="card card-pad"><Spinner size={18} /> <span className="muted small bold">Loading chats…</span></div>
      ) : !conversations.length ? (
        <div className="empty-state">
          <Icon name="chatbubbles-outline" size={38} color="#7A8E81" />
          <h3>No conversations yet</h3>
          <p>Once a farmer accepts your order, you can chat here to coordinate delivery.</p>
          <button className="btn btn-primary mt-2" onClick={() => navigate("/buyer")}>Browse products</button>
        </div>
      ) : (
        <div className="chat-list">
          {conversations.map((conversation) => (
            <button
              key={conversation.orderId}
              className="chat-list-item"
              onClick={() => navigate(`/chat/${conversation.orderId}?role=buyer`)}
            >
              <div className="chat-avatar">
                {conversation.image ? <img src={conversation.image} alt={conversation.name} /> : <span>{initials(conversation.name)}</span>}
              </div>

              <div className="chat-list-copy">
                <div className="between row">
                  <span className="chat-list-name">{conversation.name}</span>
                  <span className="chat-list-time">{conversation.time}</span>
                </div>
                <div className="chat-list-product">📦 {conversation.product}</div>
                <div className="chat-list-msg">{conversation.lastMessage}</div>
              </div>

              <span className={`chat-list-status ${conversation.rawStatus}`}>{conversation.status}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
