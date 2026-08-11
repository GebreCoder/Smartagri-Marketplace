import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import { Spinner } from "../../components/Spinner.jsx";
import { getSocket } from "../../socket.js";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { orders: data } = await api.get("/api/admin/orders");
      setOrders(data);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
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
    return () => {
      socket.off("order:changed", onChange);
      socket.off("message:new", onChange);
    };
  }, [load]);

  const counts = useMemo(
    () => ({
      pending: orders.filter((o) => o.status === "pending").length,
      accepted: orders.filter((o) => o.status === "accepted").length,
      rejected: orders.filter((o) => o.status === "rejected").length,
      disputes: orders.filter((o) => o.hasDispute).length,
    }),
    [orders]
  );

  return (
    <div>
      <h2 style={{ margin: "0 0 18px", fontSize: 22, fontWeight: 900, color: "var(--green-950)" }}>Orders</h2>

      <div className="admin-report-grid">
        <div className="admin-report-card">
          <div className="admin-report-value">{orders.length}</div>
          <div className="admin-report-label">Total orders</div>
        </div>
        <div className="admin-report-card">
          <div className="admin-report-value" style={{ color: "#D97706" }}>{counts.pending}</div>
          <div className="admin-report-label">Pending</div>
        </div>
        <div className="admin-report-card">
          <div className="admin-report-value" style={{ color: "#1E7A35" }}>{counts.accepted}</div>
          <div className="admin-report-label">Accepted</div>
        </div>
        <div className="admin-report-card">
          <div className="admin-report-value" style={{ color: "#E2554A" }}>{counts.disputes}</div>
          <div className="admin-report-label">Disputes</div>
        </div>
      </div>

      {loading ? (
        <div className="card card-pad"><Spinner size={18} /> <span className="muted small bold">Loading orders…</span></div>
      ) : (
        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Buyer</th>
                <th>Farmer</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Status</th>
                <th>Date</th>
                <th>Dispute</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <div className="admin-cell-user">
                      <div className="admin-thumb">
                        <img src={order.imageUrl || FALLBACK_IMAGE} alt={order.productName} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="admin-cell-name">{order.productName}</div>
                        <div className="admin-cell-sub">{order.productLocation}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="admin-cell-name">{order.buyerName}</div>
                    <div className="admin-cell-sub">{order.buyerLocation}</div>
                  </td>
                  <td>
                    <div className="admin-cell-name">{order.farmerName}</div>
                    <div className="admin-cell-sub">{order.farmerLocation}</div>
                  </td>
                  <td>{order.quantityLabel}</td>
                  <td className="bold">{order.totalLabel}</td>
                  <td>
                    <span className={`admin-chip admin-chip-${order.status}`}>{order.statusLabel}</span>
                  </td>
                  <td className="muted">{order.createdLabel}</td>
                  <td>
                    {order.hasDispute ? (
                      <span className="admin-chip admin-chip-dispute">
                        <Icon name="flag-outline" size={11} /> Dispute
                      </span>
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
