import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import { Spinner } from "../../components/Spinner.jsx";
import { getSocket } from "../../socket.js";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

const STATUS_PILL = {
  pending: "pill-pending",
  accepted: "pill-accepted",
  rejected: "pill-rejected",
};

export default function FarmerOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { orders: data } = await api.get("/api/orders/farmer");
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

  const updateStatus = async (order, status) => {
    setBusyId(order.id);
    try {
      await api.patch(`/api/orders/${order.id}/status`, { status });
      await load();
    } catch (err) {
      alert(err.message || "Could not update the order.");
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = useMemo(() => orders.filter((o) => o.rawStatus === "pending").length, [orders]);

  return (
    <div>
      <div className="buyer-heading">
        <h2>Incoming Orders</h2>
        <span className="section-hint">{pendingCount} pending</span>
      </div>

      {loading ? (
        <div className="card card-pad"><Spinner size={18} /> <span className="muted small bold">Loading orders…</span></div>
      ) : !orders.length ? (
        <div className="empty-state">
          <Icon name="receipt-outline" size={38} color="#7A8E81" />
          <h3>No orders yet</h3>
          <p>Orders placed by buyers on your products will appear here.</p>
        </div>
      ) : (
        orders.map((order) => (
          <div key={order.id} className="order-card">
            <div className="order-head">
              <span>
                <span className="order-id">{order.displayId}</span>
                <span className="order-date">{order.date}</span>
              </span>
              <span className={`pill ${STATUS_PILL[order.rawStatus] || "pill-pending"}`}>{order.status}</span>
            </div>

            <div className="order-body">
              <div className="order-thumb">
                <img src={order.image_url || FALLBACK_IMAGE} alt={order.product} />
              </div>
              <div className="grow">
                <div className="order-name">{order.product}</div>
                <div className="order-meta">Buyer: {order.buyer} · {order.quantityLabel} · {order.location}</div>
              </div>
              <div className="order-total">{order.amountValue ? `ETB ${order.amountValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : order.total_label}</div>
            </div>

            <div className="order-foot">
              {order.rawStatus === "pending" && (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => updateStatus(order, "accepted")} disabled={busyId === order.id}>
                    {busyId === order.id ? <Spinner light size={15} /> : <><Icon name="checkmark-outline" size={15} /> Accept</>}
                  </button>
                  <button className="btn btn-danger-soft btn-sm" onClick={() => updateStatus(order, "rejected")} disabled={busyId === order.id}>
                    <Icon name="close-outline" size={15} /> Reject
                  </button>
                </>
              )}

              {order.rawStatus === "accepted" && (
                <button className="btn btn-soft btn-sm" onClick={() => navigate(`/chat/${order.id}?role=farmer`)}>
                  <Icon name="chatbubble-ellipses-outline" size={15} /> Chat with buyer
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
