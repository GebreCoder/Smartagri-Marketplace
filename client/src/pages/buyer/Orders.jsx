import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import Modal from "../../components/Modal.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { getSocket } from "../../socket.js";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

const STATUS_PILL = {
  pending: "pill-pending",
  accepted: "pill-accepted",
  rejected: "pill-rejected",
};

const ORDER_TABS = ["All", "Pending", "Accepted", "Rejected"];

const PAYMENT_METHODS = [
  { id: "cash", label: "Cash on delivery", hint: "Pay when you receive the product", icon: "cash-outline" },
  { id: "mobile_money", label: "Mobile money", hint: "Simulated instant mobile payment (Telebirr / Chapa)", icon: "phone-portrait-outline" },
  { id: "bank_transfer", label: "Bank transfer", hint: "Simulated bank transfer", icon: "business-outline" },
];

const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.id, m.label]));

const formatEtb = (value) => `ETB ${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export default function BuyerOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [paidByOrder, setPaidByOrder] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [reportOrder, setReportOrder] = useState(null);
  const [issue, setIssue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Order status tabs
  const [activeTab, setActiveTab] = useState("All");

  // Simulated batch-payment sheet
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentStage, setPaymentStage] = useState("method");
  const [selectedMethod, setSelectedMethod] = useState("mobile_money");
  const [cardNumber, setCardNumber] = useState("");
  const [cardError, setCardError] = useState("");
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    const [orderData, paymentData] = await Promise.allSettled([
      api.get("/api/orders/buyer"),
      api.get("/api/payments/status"),
    ]);
    if (orderData.status === "fulfilled") {
      setOrders(orderData.value.orders || []);
    } else {
      setOrders([]);
    }
    if (paymentData.status === "fulfilled") {
      setPaidByOrder(paymentData.value.paidByOrder || {});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live order status updates
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

  const acceptedOrders = useMemo(() => orders.filter((o) => o.rawStatus === "accepted"), [orders]);
  const unpaidAccepted = useMemo(
    () => acceptedOrders.filter((o) => !paidByOrder[String(o.id)]),
    [acceptedOrders, paidByOrder]
  );
  const batchTotal = useMemo(
    () => unpaidAccepted.reduce((sum, o) => sum + Number(o.total || 0), 0),
    [unpaidAccepted]
  );
  const hasAccepted = acceptedOrders.length > 0;
  const allPaid = hasAccepted && unpaidAccepted.length === 0;

  const openPayment = () => {
    setSelectedMethod("mobile_money");
    setCardNumber("");
    setCardError("");
    setPaymentStage("method");
    setPaymentOpen(true);
  };

  const closePayment = () => {
    setPaymentOpen(false);
    setCardNumber("");
    setCardError("");
    setPaymentStage("method");
  };

  const payBatch = async () => {
    if (paymentStage === "method") {
      setPaymentStage("card");
      return;
    }

    const digitsOnly = cardNumber.replace(/\D/g, "");
    if (digitsOnly.length < 12) {
      setCardError("Enter a valid card number — at least 12 digits.");
      return;
    }

    setCardError("");
    setPaying(true);
    try {
      await api.post("/api/payments/from-orders", {
        orderIds: unpaidAccepted.map((o) => o.id),
        method: selectedMethod,
        cardLast4: digitsOnly.slice(-4),
      });
      closePayment();
      await load();
    } catch (err) {
      setCardError(err.message || "Payment failed. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  const confirmDelivery = async (order) => {
    setBusyId(order.id);
    try {
      await api.post(`/api/orders/${order.id}/confirm-delivery`);
      await load();
    } catch (err) {
      alert(err.message || "Could not confirm delivery.");
    } finally {
      setBusyId(null);
    }
  };

  const submitIssue = async () => {
    if (!issue.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/api/orders/${reportOrder.id}/report-issue`, { issue });
      setReportOrder(null);
      setIssue("");
      await load();
    } catch (err) {
      alert(err.message || "Could not report the issue.");
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = useMemo(() => orders.filter((o) => o.rawStatus === "pending").length, [orders]);
  const acceptedCount = useMemo(() => orders.filter((o) => o.rawStatus === "accepted").length, [orders]);
  const rejectedCount = useMemo(() => orders.filter((o) => o.rawStatus === "rejected").length, [orders]);
  const paidCount = useMemo(
    () => orders.filter((o) => paidByOrder[String(o.id)]).length,
    [orders, paidByOrder]
  );

  const tabCounts = useMemo(
    () => ({ All: orders.length, Pending: pendingCount, Accepted: acceptedCount, Rejected: rejectedCount }),
    [orders.length, pendingCount, acceptedCount, rejectedCount]
  );

  const visibleOrders = useMemo(
    () => (activeTab === "All" ? orders : orders.filter((o) => o.status === activeTab)),
    [activeTab, orders]
  );

  return (
    <div>
      <div className="buyer-heading">
        <h2>My Orders</h2>
        <span className="section-hint">{orders.length} order{orders.length === 1 ? "" : "s"}</span>
      </div>

      <div className="orders-tabs">
        {ORDER_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`orders-tab${activeTab === tab ? " orders-tab-active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
            <span className="orders-tab-count">{tabCounts[tab]}</span>
          </button>
        ))}
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", marginTop: 0 }}>
        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value stat-accent">{pendingCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Accepted</div>
          <div className="stat-value">{acceptedCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Paid</div>
          <div className="stat-value">{paidCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total spent</div>
          <div className="stat-value stat-accent">{formatEtb(orders.reduce((sum, o) => sum + Number(o.total || 0), 0))}</div>
        </div>
      </div>

      {/* Batch payment summary (only relevant while viewing all or accepted orders) */}
      {hasAccepted && (activeTab === "All" || activeTab === "Accepted") && (
        <div className="pay-batch-card">
          <div className="pay-batch-copy">
            <div className="pay-batch-title">One payment for all accepted orders</div>
            <div className="pay-batch-sub">
              {allPaid
                ? "All accepted products in this batch have been paid."
                : unpaidAccepted.length === 1
                  ? "This accepted order is ready to pay in one checkout."
                  : "These accepted orders are placed together, so pay them together in one checkout."}
            </div>
          </div>
          <div className="pay-batch-amount">
            <span className="pay-batch-amount-label">Total</span>
            <span className="pay-batch-amount-value">{formatEtb(batchTotal)}</span>
          </div>
          {allPaid ? (
            <button className="pay-batch-done" disabled>
              <Icon name="checkmark-circle-outline" size={16} /> Batch paid
            </button>
          ) : (
            <button className="pay-batch-cta" onClick={openPayment}>
              <Icon name="card-outline" size={16} /> Pay in batch
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="card card-pad"><Spinner size={18} /> <span className="muted small bold">Loading orders…</span></div>
      ) : !visibleOrders.length ? (
        <div className="empty-state">
          <Icon name="receipt-outline" size={38} color="#7A8E81" />
          <h3>{orders.length ? `No ${activeTab.toLowerCase()} orders` : "No orders yet"}</h3>
          <p>{orders.length ? "Try a different tab." : "When you place an order it will show up here."}</p>
          {!orders.length && <button className="btn btn-primary mt-2" onClick={() => navigate("/buyer")}>Browse products</button>}
        </div>
      ) : (
        visibleOrders.map((order) => {
          const payment = paidByOrder[String(order.id)];
          const isPaid = Boolean(payment);

          return (
            <div key={order.id} className="order-card">
              <div className="order-head">
                <span>
                  <span className="order-id">Order #{String(order.id).slice(0, 8)}</span>
                  <span className="order-date">{order.created_label}</span>
                </span>
                <span className="row" style={{ gap: 8 }}>
                  {order.rawStatus === "accepted" && isPaid && (
                    <span className="pill pill-paid">
                      <Icon name="checkmark-circle-outline" size={12} /> Paid
                    </span>
                  )}
                  <span className={`pill ${STATUS_PILL[order.rawStatus] || "pill-pending"}`}>{order.status}</span>
                </span>
              </div>

              <div className="order-body">
                <div className="order-thumb">
                  <img src={order.image_url || FALLBACK_IMAGE} alt={order.product_name} />
                </div>
                <div className="grow">
                  <div className="order-name">{order.product_name}</div>
                  <div className="order-meta">{order.farmer_name} · {order.quantity} kg</div>
                </div>
                <div className="order-total">{order.total_label}</div>
              </div>

              <div className="order-foot">
                {order.rawStatus === "accepted" && (
                  <>
                    <Link to={`/chat/${order.id}?role=buyer`} className="btn btn-soft btn-sm">
                      <Icon name="chatbubble-ellipses-outline" size={15} /> Chat with farmer
                    </Link>
                    {isPaid ? (
                      <span className="order-paid-note">
                        <Icon name="receipt-outline" size={14} /> Paid via {METHOD_LABEL[payment.provider] || payment.provider}
                      </span>
                    ) : (
                      <span className="order-unpaid-note">
                        <Icon name="time-outline" size={14} /> In payment batch
                      </span>
                    )}
                  </>
                )}

                {order.rawStatus === "accepted" && (
                  <button className="btn btn-primary btn-sm" onClick={() => confirmDelivery(order)} disabled={busyId === order.id}>
                    {busyId === order.id ? <Spinner light size={15} /> : <><Icon name="checkmark-done-outline" size={15} /> Confirm delivery</>}
                  </button>
                )}

                {(order.rawStatus === "pending" || order.rawStatus === "accepted") && (
                  <button className="btn btn-danger-soft btn-sm" onClick={() => setReportOrder(order)}>
                    <Icon name="flag-outline" size={15} /> Report issue
                  </button>
                )}

                {order.rawStatus === "rejected" && (
                  <span className="muted small bold">The farmer declined this order.</span>
                )}
              </div>
            </div>
          );
        })
      )}

      {/* Payment sheet */}
      <Modal open={paymentOpen} onClose={closePayment} maxWidth={440}>
        <div className="pay-sheet">
          <div className="pay-sheet-head">
            <h3>Choose payment method</h3>
            <p>Simulated payment for <strong>{unpaidAccepted.length} accepted order{unpaidAccepted.length === 1 ? "" : "s"}</strong></p>
          </div>

          <div className="pay-amount-box">
            <span className="pay-amount-label">Amount to pay</span>
            <span className="pay-amount-value">{formatEtb(batchTotal)}</span>
            <span className="pay-amount-hint">This single payment covers the whole accepted batch.</span>
          </div>

          {paymentStage === "method" ? (
            <div className="pay-method-list">
              {PAYMENT_METHODS.map((method) => {
                const active = selectedMethod === method.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    className={`pay-method-item${active ? " pay-method-active" : ""}`}
                    onClick={() => setSelectedMethod(method.id)}
                  >
                    <span className={`pay-radio${active ? " pay-radio-active" : ""}`}>
                      {active && <span className="pay-radio-dot" />}
                    </span>
                    <Icon name={method.icon} size={20} color={active ? "#1E7A35" : "#7A8E81"} />
                    <span className="pay-method-copy">
                      <span className="pay-method-title">{method.label}</span>
                      <span className="pay-method-hint">{method.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="pay-card-section">
              <div className="pay-card-title">Enter card number</div>
              <p className="pay-card-hint">This is a simulation — any 12 to 19 digit card number works for the full batch.</p>
              <input
                className="input"
                inputMode="numeric"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="1234 5678 9012 3456"
                maxLength={23}
                autoFocus
              />
              <div className="pay-card-preview">
                <span>Method</span>
                <strong>{METHOD_LABEL[selectedMethod] || selectedMethod}</strong>
              </div>
            </div>
          )}

          {cardError && (
            <div className="error-banner" style={{ marginTop: 12 }}>
              <Icon name="alert-circle-outline" size={16} />
              <span>{cardError}</span>
            </div>
          )}

          <div className="pay-sheet-actions">
            <button className="btn btn-ghost" onClick={closePayment} disabled={paying}>Cancel</button>
            <button className="btn btn-primary" onClick={payBatch} disabled={paying}>
              {paying ? <Spinner light size={16} /> : paymentStage === "method" ? "Continue" : "Pay batch now"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!reportOrder} onClose={() => { setReportOrder(null); setIssue(""); }} maxWidth={460}>
        <div className="card-pad" style={{ border: "none", boxShadow: "none" }}>
          <h3 className="create-title" style={{ fontSize: 18 }}>Report an issue</h3>
          <p className="create-sub">Tell us what went wrong with this order — the farmer and admins will be notified.</p>
          <textarea
            className="textarea"
            rows={4}
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
            placeholder="Describe the issue…"
          />
          <div className="row mt-2" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={() => { setReportOrder(null); setIssue(""); }}>Cancel</button>
            <button className="btn btn-primary" onClick={submitIssue} disabled={!issue.trim() || submitting}>
              {submitting ? <Spinner light size={16} /> : "Submit report"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
