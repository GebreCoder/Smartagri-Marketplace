import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import OrderTracker from "../../components/OrderTracker.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { getSocket } from "../../socket.js";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

const STATUS_PILL = {
  pending: "pill-pending",
  accepted: "pill-accepted",
  preparing: "pill-preparing",
  ready_for_delivery: "pill-ready",
  dispatched: "pill-dispatched",
  rejected: "pill-rejected",
  cancelled: "pill-cancelled",
  delivered: "pill-delivered",
  completed: "pill-completed",
  refunded: "pill-refunded",
};

export default function FarmerOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [settlementSummary, setSettlementSummary] = useState(null);

  const load = useCallback(async () => {
    const [orderRes, settlementRes] = await Promise.allSettled([
      api.get("/api/orders/farmer"),
      api.get("/api/settlements"),
    ]);
    if (orderRes.status === "fulfilled") {
      setOrders(orderRes.value.orders || []);
    } else {
      setOrders([]);
    }
    if (settlementRes.status === "fulfilled") {
      setSettlements(settlementRes.value.settlements || []);
      setSettlementSummary(settlementRes.value.summary || null);
    }
    setLoading(false);
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
              <span className="row" style={{ gap: 8 }}>
                {order.is_paid && (
                  <span className="pill pill-paid">
                    <Icon name="checkmark-circle-outline" size={12} /> Paid
                  </span>
                )}
                <span className={`pill ${STATUS_PILL[order.rawStatus] || "pill-pending"}`}>{order.status}</span>
              </span>
            </div>

              <div className="order-body">
                <div className="order-thumb">
                  <img src={order.image_url || FALLBACK_IMAGE} alt={order.product} />
                </div>
                <div className="grow">
                  <div className="order-name">{order.product}</div>
                  <div className="order-meta">
                    Buyer: {order.buyer} · {order.quantityLabel}
                    {order.buyer_location && <> · {order.buyer_location}</>}
                  </div>
                </div>
                <div className="order-total">{order.amountValue ? `ETB ${order.amountValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : order.total_label}</div>
              </div>

              <div className="order-delivery">
                <Icon name={order.delivery_method === "pickup" ? "storefront-outline" : "navigate-outline"} size={14} />
                <span>{order.delivery_method_label}</span>
                {order.delivery_address && <span> · {order.delivery_address}</span>}
                {order.delivery_notes && <span className="muted"> · {order.delivery_notes}</span>}
              </div>

            {/* Lifecycle progress + timeline */}
            <OrderTracker
              steps={order.steps}
              terminal={order.trackerTerminal}
              terminalLabel={order.trackerTerminalLabel}
              events={order.events}
            />

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
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => updateStatus(order, "preparing")} disabled={busyId === order.id}>
                    {busyId === order.id ? <Spinner light size={15} /> : <><Icon name="cube-outline" size={15} /> Start preparing</>}
                  </button>
                  {order.is_paid && (
                    <button className="btn btn-soft btn-sm" onClick={() => updateStatus(order, "dispatched")} disabled={busyId === order.id}>
                      <Icon name="navigate-outline" size={15} /> Dispatch
                    </button>
                  )}
                  {!order.is_paid && (
                    <span className="order-unpaid-note">
                      <Icon name="time-outline" size={14} /> Waiting for buyer payment
                    </span>
                  )}
                  <button className="btn btn-soft btn-sm" onClick={() => navigate(`/chat/${order.id}?role=farmer`)}>
                    <Icon name="chatbubble-ellipses-outline" size={15} /> Chat with buyer
                  </button>
                </>
              )}

              {order.rawStatus === "preparing" && (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => updateStatus(order, "ready_for_delivery")} disabled={busyId === order.id}>
                    {busyId === order.id ? <Spinner light size={15} /> : <><Icon name="checkmark-done-outline" size={15} /> Ready for delivery</>}
                  </button>
                  <button className="btn btn-soft btn-sm" onClick={() => navigate(`/chat/${order.id}?role=farmer`)}>
                    <Icon name="chatbubble-ellipses-outline" size={15} /> Chat with buyer
                  </button>
                </>
              )}

              {order.rawStatus === "ready_for_delivery" && (
                <>
                  {order.is_paid ? (
                    <button className="btn btn-primary btn-sm" onClick={() => updateStatus(order, "dispatched")} disabled={busyId === order.id}>
                      {busyId === order.id ? <Spinner light size={15} /> : <><Icon name="navigate-outline" size={15} /> Dispatch now</>}
                    </button>
                  ) : (
                    <span className="order-unpaid-note">
                      <Icon name="time-outline" size={14} /> Ready — waiting for buyer payment
                    </span>
                  )}
                  <button className="btn btn-soft btn-sm" onClick={() => navigate(`/chat/${order.id}?role=farmer`)}>
                    <Icon name="chatbubble-ellipses-outline" size={15} /> Chat with buyer
                  </button>
                </>
              )}

              {order.rawStatus === "dispatched" && (
                <span className="muted small bold">Sent out for delivery — waiting for the buyer to confirm.</span>
              )}

              {order.rawStatus === "delivered" && (
                <button className="btn btn-soft btn-sm" onClick={() => navigate(`/chat/${order.id}?role=farmer`)}>
                  <Icon name="chatbubble-ellipses-outline" size={15} /> Chat with buyer
                </button>
              )}

              {order.rawStatus === "cancelled" && (
                <span className="muted small bold">The buyer cancelled this order.</span>
              )}

              {order.rawStatus === "rejected" && (
                <span className="muted small bold">You declined this order.</span>
              )}

              {order.rawStatus === "refunded" && (
                <span className="order-unpaid-note">
                  <Icon name="refresh-outline" size={14} /> This order was refunded — stock restored
                </span>
              )}

              {order.rawStatus === "completed" && (
                <span className="order-paid-note">
                  <Icon name="checkmark-done-circle-outline" size={14} /> Order completed — settlement eligible
                </span>
              )}
            </div>
          </div>
        ))
      )}

      {/* ── Settlements ─────────────────────────────────────────── */}
      <div className="buyer-heading" style={{ marginTop: 28 }}>
        <h2>Settlements</h2>
        <span className="section-hint">Payouts from completed orders</span>
      </div>

      <div className="stl-summary">
        <div className="stl-card stl-card-acc">
          <div className="stl-label">Eligible to receive</div>
          <div className="stl-value stl-value-acc">{settlementSummary?.eligibleAmount || "ETB 0"}</div>
          <div className="stl-item-sub">{settlementSummary?.eligibleCount || 0} settlement{settlementSummary?.eligibleCount === 1 ? "" : "s"} ready</div>
        </div>
        <div className="stl-card">
          <div className="stl-label">Paid out</div>
          <div className="stl-value">{settlementSummary?.settledAmount || "ETB 0"}</div>
          <div className="stl-item-sub">{settlementSummary?.settledCount || 0} settled</div>
        </div>
        <div className="stl-card">
          <div className="stl-label">Platform fee</div>
          <div className="stl-value">5%</div>
          <div className="stl-item-sub">Retained per completed order</div>
        </div>
      </div>

      {settlements.length === 0 ? (
        <div className="empty-state" style={{ padding: "32px 16px" }}>
          <Icon name="wallet-outline" size={34} color="#7A8E81" />
          <h3>No settlements yet</h3>
          <p>When a buyer completes one of your orders, your payout appears here.</p>
        </div>
      ) : (
        settlements.map((settlement) => (
          <div key={settlement.id} className="stl-item">
            <div className="stl-item-main">
              <div className="stl-item-title">{settlement.productName} · {settlement.orderQuantity} kg</div>
              <div className="stl-item-sub">
                {settlement.reference} · {settlement.createdLabel}
              </div>
              <div className="stl-item-sub">
                Product {settlement.productAmount} + delivery {settlement.deliveryFee} − platform fee {settlement.platformFee}
              </div>
            </div>
            <span className={`pill ${settlement.status === "eligible" ? "pill-eligible" : settlement.status === "processing" ? "pill-processing" : settlement.status === "settled" ? "pill-settled" : "pill-failed"}`}>
              {settlement.status === "eligible" ? "Eligible" : settlement.status === "settled" ? "Settled" : settlement.status}
            </span>
            <div className="stl-item-amount">{settlement.netAmount}</div>
          </div>
        ))
      )}
    </div>
  );
}
