import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import { Spinner } from "../../components/Spinner.jsx";
import { getSocket } from "../../socket.js";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get("/api/admin/stats");
      setStats(data);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const onChange = () => load();
    socket.on("order:changed", onChange);
    socket.on("message:new", onChange);
    socket.on("product:changed", onChange);
    return () => {
      socket.off("order:changed", onChange);
      socket.off("message:new", onChange);
      socket.off("product:changed", onChange);
    };
  }, [load]);

  if (!stats) {
    return <div className="card card-pad"><Spinner size={18} /> <span className="muted small bold">Loading stats…</span></div>;
  }

  const cards = [
    { label: "Active users", value: stats.activeUsers, icon: "people-outline", tone: "#E7F4EA", color: "#1E7A35", to: "/admin/users" },
    { label: "Products listed", value: stats.totalProducts, icon: "cube-outline", tone: "#FFF6E0", color: "#B07A0A", to: "/admin/products" },
    { label: "Total orders", value: stats.totalOrders, icon: "receipt-outline", tone: "#DDE7F8", color: "#2859A8", to: "/admin/orders" },
    { label: "Open chats", value: stats.openChats, icon: "chatbubbles-outline", tone: "#F3E8FF", color: "#7C3AED", to: "/admin/chat" },
    { label: "Pending orders", value: stats.pendingOrders, icon: "time-outline", tone: "#FEF3E2", color: "#D97706", to: "/admin/orders" },
    { label: "Reported issues", value: stats.reportItems, icon: "flag-outline", tone: "#FFEDE9", color: "#E2554A", to: "/admin/reports" },
  ];

  return (
    <div>
      <h2 style={{ margin: "0 0 18px", fontSize: 22, fontWeight: 900, color: "var(--green-950)" }}>Overview</h2>

      <div className="admin-stat-grid">
        {cards.map((card) => (
          <button key={card.label} className="admin-stat" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => navigate(card.to)}>
            <div className="admin-stat-icon" style={{ background: card.tone }}>
              <Icon name={card.icon} size={19} color={card.color} />
            </div>
            <div className="admin-stat-value">{card.value}</div>
            <div className="admin-stat-label">{card.label}</div>
          </button>
        ))}
      </div>

      <div className="admin-table-card">
        <div style={{ padding: "14px 16px", fontWeight: 900, fontSize: 14, borderBottom: "1px solid var(--border-2)" }}>
          Order status breakdown
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Orders</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {["pending", "accepted", "rejected"].map((status) => {
              const count = status === "pending" ? stats.pendingOrders : status === "accepted" ? stats.acceptedOrders : stats.totalOrders - stats.pendingOrders - stats.acceptedOrders;
              const share = stats.totalOrders ? Math.round((count / stats.totalOrders) * 100) : 0;
              return (
                <tr key={status}>
                  <td>
                    <span className={`pill ${status === "pending" ? "pill-pending" : status === "accepted" ? "pill-accepted" : "pill-rejected"}`}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                  </td>
                  <td className="bold">{count}</td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <div className="grow" style={{ height: 8, borderRadius: 99, background: "var(--surface-2)", overflow: "hidden" }}>
                        <div style={{ width: `${share}%`, height: "100%", background: "var(--green-500)", borderRadius: 99 }} />
                      </div>
                      <span className="small bold muted">{share}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
