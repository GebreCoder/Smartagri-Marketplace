import { useCallback, useEffect, useRef, useState } from "react";
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

const fmtTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function AdminChat() {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [message, setMessage] = useState("");
  const [receiverId, setReceiverId] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const loadUsers = useCallback(async () => {
    try {
      const { users: data } = await api.get("/api/admin/chat/users");
      setUsers(data);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const openThread = async (user) => {
    setSelectedUser(user);
    setThread(null);
    const orderId = user.latestOrderId;
    if (!orderId) return;
    setLoadingThread(true);
    try {
      const data = await api.get(`/api/admin/chat/threads/${orderId}`);
      setThread(data);
      setReceiverId(data.receiverOptions?.[0]?.value || "");
    } catch (err) {
      setThread({ error: err.message });
    } finally {
      setLoadingThread(false);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!message.trim() || !receiverId) return;
    setSending(true);
    try {
      await api.post(`/api/admin/chat/threads/${thread.order.id}/messages`, {
        receiverId,
        message,
      });
      setMessage("");
      if (thread.order?.id) {
        const data = await api.get(`/api/admin/chat/threads/${thread.order.id}`);
        setThread(data);
      }
    } catch (err) {
      alert(err.message || "Could not send the message.");
    } finally {
      setSending(false);
    }
  };

  const clearThread = async () => {
    if (!thread?.order?.id) return;
    if (!window.confirm("Clear the entire chat thread for this order?")) return;
    try {
      await api.del(`/api/admin/chat/threads/${thread.order.id}/messages`);
      const data = await api.get(`/api/admin/chat/threads/${thread.order.id}`);
      setThread(data);
      loadUsers();
    } catch (err) {
      alert(err.message || "Could not clear the thread.");
    }
  };

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages?.length]);

  // Live refresh of the open thread
  useEffect(() => {
    if (!thread?.order?.id) return undefined;
    const socket = getSocket();
    const onMessageNew = (payload) => {
      if (String(payload.orderId) === String(thread.order.id)) {
        api.get(`/api/admin/chat/threads/${thread.order.id}`).then((data) => setThread(data)).catch(() => {});
      }
    };
    socket.on("message:new", onMessageNew);
    return () => socket.off("message:new", onMessageNew);
  }, [thread?.order?.id]);

  const messages = thread?.messages || [];
  const selfId = String(thread?.order?.buyer_id || "");

  return (
    <div>
      <h2 style={{ margin: "0 0 18px", fontSize: 22, fontWeight: 900, color: "var(--green-950)" }}>Chat Monitor</h2>

      <div className="admin-chat-grid">
        <div className="admin-user-list">
          {loading ? (
            <div className="card-pad"><Spinner size={18} /> <span className="muted small bold">Loading users…</span></div>
          ) : !users.length ? (
            <div className="card-pad muted small bold">No users yet.</div>
          ) : (
            users.map((user) => (
              <button
                key={user.id}
                className={`admin-user-item${selectedUser?.id === user.id ? " admin-user-item-active" : ""}`}
                onClick={() => openThread(user)}
              >
                <div className="admin-cell-avatar">
                  {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} /> : <span>{initials(user.name)}</span>}
                </div>
                <div className="admin-user-copy">
                  <div className="between row">
                    <span className="admin-cell-name">{user.name}</span>
                    <span className="admin-cell-sub">{user.threadCount} thread{user.threadCount === 1 ? "" : "s"}</span>
                  </div>
                  <div className="admin-cell-sub">{user.userType} · {user.latestProductName || "No orders"}</div>
                  <div className="admin-cell-sub" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {user.latestMessage}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="admin-thread-panel">
          {!selectedUser ? (
            <div className="empty-state" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <Icon name="chatbubbles-outline" size={38} color="#7A8E81" />
              <h3>Select a user</h3>
              <p>Pick a user on the left to view their conversations.</p>
            </div>
          ) : loadingThread ? (
            <div className="card-pad" style={{ flex: 1 }}><Spinner size={18} /> <span className="muted small bold">Loading thread…</span></div>
          ) : thread?.error ? (
            <div className="empty-state" style={{ flex: 1 }}>
              <h3>{thread.error}</h3>
            </div>
          ) : !thread ? (
            <div className="empty-state" style={{ flex: 1 }}>
              <h3>No active orders</h3>
              <p>{selectedUser.name} has no orders to monitor.</p>
            </div>
          ) : (
            <>
              <div className="admin-thread-head">
                <div>
                  <div className="admin-thread-name">Order #{String(thread.order.id).slice(0, 8)} · {thread.product?.name || "Product"}</div>
                  <div className="admin-thread-meta">
                    {thread.buyer?.name} ↔ {thread.farmer?.name} · status: {thread.order.status}
                  </div>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={clearThread} title="Clear thread">
                  <Icon name="trash-outline" size={14} />
                </button>
              </div>

              <div className="admin-messages">
                {messages.map((msg) => {
                  const isIssue = String(msg.message || "").startsWith("Issue reported:");
                  const isOut = String(msg.sender_id) === selfId && thread.role !== "admin";
                  if (isIssue) {
                    return (
                      <div key={msg.id} className="admin-msg-system">
                        🚩 {msg.message}
                      </div>
                    );
                  }
                  const senderName = String(msg.sender_id) === String(thread.buyer?.id)
                    ? thread.buyer?.name
                    : String(msg.sender_id) === String(thread.farmer?.id)
                      ? thread.farmer?.name
                      : "Admin";
                  return (
                    <div key={msg.id} className={`admin-msg ${isOut ? "admin-msg-out" : "admin-msg-in"}`}>
                      <div>{msg.message}</div>
                      <div className="admin-msg-meta">{senderName} · {fmtTime(msg.created_at)}</div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <form className="admin-composer" onSubmit={sendMessage}>
                <select className="select" value={receiverId} onChange={(e) => setReceiverId(e.target.value)}>
                  <option value="">Send as…</option>
                  {thread.receiverOptions?.map((option) => (
                    <option key={option.value} value={option.value}>To {option.label} ({option.name})</option>
                  ))}
                </select>
                <input
                  className="input grow"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type a message…"
                />
                <button className="btn btn-primary" type="submit" disabled={!message.trim() || !receiverId || sending}>
                  {sending ? <Spinner light size={16} /> : <Icon name="send-outline" size={16} />}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
