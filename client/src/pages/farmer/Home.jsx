import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import DashboardHeader from "../../components/DashboardHeader.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { getSocket } from "../../socket.js";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

// Products at or below this stock count trigger a low-stock alert (matches the original app).
const LOW_STOCK_THRESHOLD = 5;

const STATUS_PILL = {
  pending: "pill-pending",
  accepted: "pill-accepted",
  rejected: "pill-rejected",
};

export default function FarmerHome() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [productData, orderData] = await Promise.all([
        api.get("/api/products/mine/all"),
        api.get("/api/orders/farmer"),
      ]);
      setProducts(productData.products || []);
      setOrders(orderData.orders || []);
    } catch {
      setProducts([]);
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

  const stats = useMemo(() => {
    const pending = orders.filter((o) => o.rawStatus === "pending").length;
    const accepted = orders.filter((o) => o.rawStatus === "accepted").length;
    const totalRevenue = orders
      .filter((o) => o.rawStatus === "accepted")
      .reduce((sum, o) => sum + Number(o.total || 0), 0);
    const lowStock = products.filter((p) => Number(p.quantity || 0) <= LOW_STOCK_THRESHOLD).length;
    const stockValue = products.reduce(
      (sum, p) => sum + Number(p.price || 0) * Number(p.quantity || 0),
      0
    );
    return { pending, accepted, totalRevenue, lowStock, stockValue };
  }, [orders, products]);

  const recentOrders = orders.slice(0, 4);

  return (
    <div>
      <DashboardHeader role="farmer" />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">My products</div>
          <div className="stat-value">{products.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending orders</div>
          <div className="stat-value stat-accent">{stats.pending}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Accepted</div>
          <div className="stat-value">{stats.accepted}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Revenue</div>
          <div className="stat-value stat-accent">
            {`ETB ${stats.totalRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          </div>
        </div>
        <div className={`stat-card${stats.lowStock ? " stat-card-warn" : ""}`}>
          <div className="stat-label">Low stock alerts</div>
          <div className={`stat-value${stats.lowStock ? " stat-warn" : ""}`}>{stats.lowStock}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Stock value</div>
          <div className="stat-value stat-accent">
            {`ETB ${stats.stockValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          </div>
        </div>
      </div>

      <div className="buyer-heading">
        <h2>Recent orders</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/farmer/orders")}>
          View all <Icon name="chevron-forward" size={14} />
        </button>
      </div>

      {loading ? (
        <div className="card card-pad"><Spinner size={18} /> <span className="muted small bold">Loading dashboard…</span></div>
      ) : !recentOrders.length ? (
        <div className="empty-state">
          <Icon name="receipt-outline" size={38} color="#7A8E81" />
          <h3>No orders yet</h3>
          <p>When buyers order your products you'll see them here.</p>
          <button className="btn btn-primary mt-2" onClick={() => navigate("/farmer/products")}>View my products</button>
        </div>
      ) : (
        recentOrders.map((order) => (
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
                <div className="order-meta">{order.buyer} · {order.quantityLabel}</div>
              </div>
              <div className="order-total">{order.amountValue ? `ETB ${order.amountValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : ""}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
