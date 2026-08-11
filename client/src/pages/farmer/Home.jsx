import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import Modal from "../../components/Modal.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { Sparkline, AreaChart, DonutChart, ProgressBar } from "../../components/Charts.jsx";
import { getSocket } from "../../socket.js";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

const KPI_ICONS = {
  totalSales: "stats-chart-outline",
  totalOrders: "receipt-outline",
  activeProducts: "cube-outline",
  availableInventory: "layers-outline",
  revenue30: "wallet-outline",
  pendingOrders: "time-outline",
};

const KPI_COLORS = {
  totalSales: "#16A34A",
  totalOrders: "#059669",
  activeProducts: "#0D9488",
  availableInventory: "#D97706",
  revenue30: "#16A34A",
  pendingOrders: "#DC2626",
};

const STATUS_BADGE = {
  pending: "st-pending",
  accepted: "st-shipped",
  delivered: "st-delivered",
  rejected: "st-cancelled",
};

const WEATHER_ICON = {
  sunny: "sunny-outline",
  partly: "partly-sunny-outline",
  rain: "rainy-outline",
  cloudy: "cloud-outline",
};

const INSIGHT_ICON = {
  alert: "alert-circle-outline",
  order: "receipt-outline",
  harvest: "basket-outline",
  trend: "trending-up-outline",
  water: "water-outline",
  pest: "bug-outline",
};

const fmtMoney = (v) => `ETB ${Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const EMPTY_HARVEST = { cropName: "", category: "Vegetables", quantityKg: "", harvestedAt: "" };

export default function FarmerHome() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);
  const [harvestOpen, setHarvestOpen] = useState(false);
  const [harvestForm, setHarvestForm] = useState(EMPTY_HARVEST);
  const [savingHarvest, setSavingHarvest] = useState(false);
  const [aiParagraph, setAiParagraph] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await api.get(`/api/dashboard/farmer?days=${range}`);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  // Real LLM insight paragraph when a key is configured (rules fallback otherwise).
  useEffect(() => {
    if (!data?.aiInsights?.length) return;
    const context = `Active products: ${data.kpis?.activeProducts?.value ?? 0}. Pending orders: ${data.kpis?.pendingOrders?.value ?? 0}. ` +
      `Total sales: ${data.kpis?.totalSales?.value ?? 0} ETB. Crops: ${data.crops.map((c) => `${c.name} (${c.progress}%)`).join(", ") || "none"}.`;
    api
      .post("/api/dashboard/ai-insight", {
        role: "farmer",
        context,
        fallback: data.aiInsights[0]?.text || "Keep an eye on your pending orders and market prices today.",
      })
      .then((result) => setAiParagraph(result))
      .catch(() => setAiParagraph(null));
  }, [data]);

  const saveHarvest = async () => {
    const quantityKg = Number(harvestForm.quantityKg);
    if (!harvestForm.cropName.trim() || !(quantityKg > 0)) return;
    setSavingHarvest(true);
    try {
      await api.post("/api/dashboard/harvests", {
        cropName: harvestForm.cropName,
        category: harvestForm.category,
        quantityKg,
        harvestedAt: harvestForm.harvestedAt || null,
      });
      setHarvestOpen(false);
      setHarvestForm(EMPTY_HARVEST);
      load(); // refresh production donut + KPI deltas
    } catch {
      alert("Could not record the harvest.");
    } finally {
      setSavingHarvest(false);
    }
  };

  const setHarvest = (key) => (event) => setHarvestForm((prev) => ({ ...prev, [key]: event.target.value }));

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const onChange = () => load();
    socket.on("order:changed", onChange);
    socket.on("message:new", onChange);
    // Re-sync on (re)connect so events fired before the socket was up
    // (or during a reconnect gap) are never missed.
    socket.on("connect", onChange);
    return () => {
      socket.off("order:changed", onChange);
      socket.off("message:new", onChange);
      socket.off("connect", onChange);
    };
  }, [load]);

  const kpiEntries = useMemo(() => (data?.kpis ? Object.entries(data.kpis) : []), [data]);

  const formatKpiValue = (kpi) => {
    if (kpi.format === "money") return fmtMoney(kpi.value);
    if (kpi.format === "kg") return `${Number(kpi.value).toLocaleString("en-US")} kg`;
    return Number(kpi.value).toLocaleString("en-US");
  };

  if (loading) {
    return (
      <div className="d2-page d2-loading">
        <Spinner size={22} />
        <span>Loading your farm command center…</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="d2-page">
        <div className="empty-state">
          <Icon name="leaf-outline" size={38} color="#7A8E81" />
          <h3>Could not load your dashboard</h3>
          <p>Please try again in a moment.</p>
        </div>
      </div>
    );
  }

  const { user, kpis, salesChart, production, aiInsights, marketPrices, recentOrders, inventory, crops, activities, weather, dateLabel } = data;
  const firstName = String(user?.full_name || "Farmer").split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="d2-page">
      {/* ── Welcome + weather row ── */}
      <div className="d2-welcome-row">
        <div className="d2-card d2-welcome">
          <div className="d2-welcome-copy">
            <div className="d2-welcome-title">{greeting}, {firstName} 🌾</div>
            <div className="d2-welcome-sub">Here&apos;s what&apos;s happening on your farm today.</div>
            <div className="d2-welcome-date">
              <Icon name="calendar-outline" size={14} /> {dateLabel}
            </div>
            <div className="d2-welcome-chip">
              <Icon name="partly-sunny-outline" size={15} color="#16A34A" />
              <span>{weather.temp}°C · {weather.condition}</span>
              <span className="d2-welcome-chip-muted">Humidity {weather.humidity}% · Rain {weather.rain}% · Wind {weather.wind} km/h</span>
            </div>
          </div>
          <div className="d2-welcome-art">
            <div className="d2-welcome-temp">{weather.temp}°</div>
            <Icon name="partly-sunny-outline" size={34} color="#DCFCE7" />
            <div className="d2-welcome-cond">{weather.condition}</div>
          </div>
        </div>

        {/* ── Weather forecast widget ── */}
        <div className="d2-card d2-weather-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Weather</div>
            <Icon name="location-outline" size={15} color="#94A3B8" />
          </div>
          <div className="d2-weather-now">
            <div className="d2-weather-temp">{weather.temp}°C</div>
            <div className="d2-weather-cond">{weather.condition}</div>
          </div>
          <div className="d2-weather-metrics">
            <span><Icon name="water-outline" size={13} /> Humidity {weather.humidity}%</span>
            <span><Icon name="rainy-outline" size={13} /> Rain {weather.rain}%</span>
            <span><Icon name="cloud-outline" size={13} /> Wind {weather.wind} km/h</span>
          </div>
          <div className="d2-forecast">
            {weather.forecast.map((day) => (
              <div className="d2-forecast-day" key={day.day}>
                <span className="d2-forecast-name">{day.day}</span>
                <Icon name={WEATHER_ICON[day.icon] || "partly-sunny-outline"} size={18} color="#16A34A" />
                <span className="d2-forecast-temp">{day.hi}° / {day.lo}°</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="d2-kpi-grid">
        {kpiEntries.map(([key, kpi]) => {
          const positive = Number(kpi.delta) >= 0;
          return (
            <div className="d2-kpi" key={key}>
              <div className="d2-kpi-top">
                <span className="d2-kpi-icon" style={{ background: `${KPI_COLORS[key]}1A`, color: KPI_COLORS[key] }}>
                  <Icon name={KPI_ICONS[key] || "stats-chart-outline"} size={18} />
                </span>
                <Sparkline values={kpi.spark} color={KPI_COLORS[key]} />
              </div>
              <div className="d2-kpi-label">{kpi.label}</div>
              <div className="d2-kpi-value">{formatKpiValue(kpi)}</div>
              <div className={`d2-kpi-delta ${positive ? "up" : "down"}`}>
                <Icon name={positive ? "arrow-up" : "arrow-down"} size={12} />
                {Math.abs(kpi.delta)}% vs last 30 days
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Charts row ── */}
      <div className="d2-grid-4">
        <div className="d2-card d2-span-2">
          <div className="d2-card-head">
            <div className="d2-card-title">Sales &amp; Revenue</div>
            <div className="d2-range-pills">
              {[7, 30, 90, 365].map((d) => (
                <button
                  key={d}
                  className={`d2-range-pill${range === d ? " active" : ""}`}
                  onClick={() => setRange(d)}
                >
                  {d === 7 ? "7 Days" : d === 30 ? "30 Days" : d === 90 ? "3 Months" : "12 Months"}
                </button>
              ))}
            </div>
          </div>
          <div className="d2-chart-legend">
            <span className="d2-legend-item"><i style={{ background: "#16A34A" }} /> Revenue (ETB)</span>
            <span className="d2-legend-item"><i style={{ background: "#F59E0B" }} /> Orders</span>
          </div>
          <AreaChart labels={salesChart.labels} revenue={salesChart.revenue} orders={salesChart.orders} />
        </div>

        <div className="d2-card d2-donut-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Farm Performance</div>
          </div>
          <div className="d2-donut-wrap">
            <DonutChart
              items={production.items}
              size={150}
              thickness={20}
              centerLabel="Total Production"
              centerValue={`${Number(production.total).toLocaleString("en-US")} kg`}
            />
            <div className="d2-donut-legend">
              {production.items.map((item) => (
                <div className="d2-donut-legend-row" key={item.label}>
                  <span className="d2-dot" style={{ background: item.color }} />
                  <span className="d2-donut-label">{item.label}</span>
                  <span className="d2-donut-value">{item.value.toLocaleString("en-US")} kg ({item.pct}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="d2-card d2-ai-card">
          <div className="d2-card-head">
            <div className="d2-card-title">
              <Icon name="sparkles" size={15} color="#16A34A" /> AI Farm Insights
            </div>
            <span className="d2-new-badge">New</span>
          </div>
          <div className="d2-insights">
            {aiParagraph?.text && (
              <div className="d2-insight d2-insight-hero">
                <span className="d2-insight-icon">
                  <Icon name="sparkles" size={15} color="#16A34A" />
                </span>
                <div>
                  <div className="d2-insight-title">
                    AI Summary {aiParagraph.source === "ai" && <span className="d2-tag-live">Live AI</span>}
                  </div>
                  <div className="d2-insight-text">{aiParagraph.text}</div>
                </div>
              </div>
            )}
            {aiInsights.map((insight, index) => (
              <div className="d2-insight" key={index}>
                <span className="d2-insight-icon">
                  <Icon name={INSIGHT_ICON[insight.icon] || "sparkles-outline"} size={15} />
                </span>
                <div>
                  <div className="d2-insight-title">{insight.title}</div>
                  <div className="d2-insight-text">{insight.text}</div>
                </div>
              </div>
            ))}
          </div>
          <button className="d2-link-btn" onClick={() => navigate("/farmer/crops")}>
            View All Insights <Icon name="chevron-forward" size={13} />
          </button>
        </div>

        <div className="d2-card d2-market-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Market Prices</div>
            <button className="d2-link-btn" onClick={() => navigate("/farmer/market-prices")}>View All</button>
          </div>
          <table className="d2-table d2-table-sm">
            <thead>
              <tr>
                <th>Crop</th>
                <th>Current Price</th>
                <th>Change</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {marketPrices.slice(0, 5).map((p) => {
                const up = Number(p.change_pct) >= 0;
                return (
                  <tr key={p.name}>
                    <td className="d2-cell-name">{p.name}</td>
                    <td className="d2-cell-price">{p.price_label}</td>
                    <td className={up ? "d2-up" : "d2-down"}>{up ? "↑" : "↓"} {Math.abs(p.change_pct)}%</td>
                    <td><Sparkline values={up ? [2, 3, 4, 5, 6] : [6, 5, 4, 3, 2]} color={up ? "#16A34A" : "#DC2626"} width={52} height={20} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Orders + Inventory + Crops + Calendar ── */}
      <div className="d2-grid-bottom">
        <div className="d2-card d2-orders-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Recent Orders</div>
            <button className="d2-link-btn" onClick={() => navigate("/farmer/orders")}>View All Orders</button>
          </div>
          {recentOrders.length ? (
            <table className="d2-table">
              <thead>
                <tr>
                  <th>Order ID</th><th>Buyer</th><th>Product</th><th>Qty</th><th>Amount</th><th>Date</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.displayId}>
                    <td className="d2-cell-id">{order.displayId}</td>
                    <td>{order.buyer}</td>
                    <td className="d2-cell-name">{order.product}</td>
                    <td>{order.quantity}</td>
                    <td className="d2-cell-price">{order.amount}</td>
                    <td className="d2-cell-date">{order.date}</td>
                    <td><span className={`d2-status ${STATUS_BADGE[order.rawStatus] || "st-pending"}`}>{order.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="d2-table-empty">No orders yet — buyers will appear here once they order.</div>
          )}
        </div>

        <div className="d2-card d2-inventory-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Inventory Overview</div>
            <button className="d2-btn-primary-sm" onClick={() => navigate("/farmer/create")}>
              <Icon name="add-outline" size={13} /> Add Product
            </button>
          </div>
          <table className="d2-table d2-table-sm">
            <thead>
              <tr><th>Product</th><th>Available</th><th>Min. Stock</th><th>Status</th><th>Price</th></tr>
            </thead>
            <tbody>
              {inventory.slice(0, 5).map((item) => (
                <tr key={item.name}>
                  <td className="d2-cell-name">{item.name}</td>
                  <td>{item.available} kg</td>
                  <td className="d2-cell-date">{item.min_stock} kg</td>
                  <td>
                    <span className={`d2-status ${item.status === "Low Stock" ? "st-pending" : "st-delivered"}`}>{item.status}</span>
                  </td>
                  <td className="d2-cell-price">{item.price_label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="d2-card d2-crops-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Active Crops</div>
            <button className="d2-link-btn" onClick={() => navigate("/farmer/crops")}>View All</button>
          </div>
          <div className="d2-crops">
            {crops.slice(0, 4).map((crop) => {
              const healthy = String(crop.health).toLowerCase() !== "fair";
              return (
                <div className="d2-crop" key={crop.id}>
                  <img src={crop.image_url || FALLBACK_IMAGE} alt={crop.name} className="d2-crop-img" />
                  <div className="d2-crop-body">
                    <div className="d2-crop-top">
                      <span className="d2-crop-name">{crop.name}</span>
                      <span className={`d2-health ${healthy ? "good" : "fair"}`}>{crop.health}</span>
                    </div>
                    <div className="d2-crop-meta">{crop.growth_stage} · Planted {crop.planted_date}</div>
                    <ProgressBar value={crop.progress} color={healthy ? "#16A34A" : "#D97706"} showLabel />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="d2-card d2-calendar-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Farm Calendar</div>
            <button className="d2-link-btn" onClick={() => navigate("/farmer/calendar")}>View All</button>
          </div>
          <div className="d2-calendar">
            {activities.slice(0, 5).map((activity) => (
              <div className="d2-cal-item" key={activity.id}>
                <span className="d2-cal-dot" />
                <div className="d2-cal-body">
                  <div className="d2-cal-title">{activity.title} — {activity.crop_name}</div>
                  <div className="d2-cal-date">{activity.activity_date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div className="d2-card d2-quick-card">
        <div className="d2-card-head">
          <div className="d2-card-title">Quick Actions</div>
        </div>
        <div className="d2-quick-actions">
          <button className="d2-quick-btn" onClick={() => navigate("/farmer/create")}>
            <span className="d2-quick-icon"><Icon name="add-circle-outline" size={18} /></span> Add Product
          </button>
          <button className="d2-quick-btn" onClick={() => navigate("/farmer/crops")}>
            <span className="d2-quick-icon"><Icon name="flower-outline" size={18} /></span> Add Crop
          </button>
          <button className="d2-quick-btn" onClick={() => setHarvestOpen(true)}>
            <span className="d2-quick-icon"><Icon name="basket-outline" size={18} /></span> Record Harvest
          </button>
          <button className="d2-quick-btn" onClick={() => navigate("/farmer/orders")}>
            <span className="d2-quick-icon"><Icon name="receipt-outline" size={18} /></span> View Orders
          </button>
          <button className="d2-quick-btn" onClick={() => navigate("/farmer/products")}>
            <span className="d2-quick-icon"><Icon name="layers-outline" size={18} /></span> Update Inventory
          </button>
          <button className="d2-quick-btn" onClick={() => navigate("/farmer/calendar")}>
            <span className="d2-quick-icon"><Icon name="calendar-outline" size={18} /></span> Create Activity
          </button>
        </div>
      </div>

      {/* ── Record harvest modal ── */}
      <Modal open={harvestOpen} onClose={() => { setHarvestOpen(false); setHarvestForm(EMPTY_HARVEST); }} maxWidth={460}>
        <div className="d2-form-modal">
          <h3 className="create-title">Record Harvest 🌾</h3>
          <p className="create-sub">Add a harvest to update your Farm Performance breakdown.</p>
          <label className="d2-field">
            <span>Crop name</span>
            <input value={harvestForm.cropName} onChange={setHarvest("cropName")} placeholder="e.g. Tomatoes" />
          </label>
          <div className="d2-form-row">
            <label className="d2-field">
              <span>Category</span>
              <select value={harvestForm.category} onChange={setHarvest("category")}>
                {["Vegetables", "Grains", "Fruits", "Pulses", "Spices", "Other"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="d2-field">
              <span>Quantity (kg)</span>
              <input type="number" min="1" value={harvestForm.quantityKg} onChange={setHarvest("quantityKg")} placeholder="e.g. 250" />
            </label>
          </div>
          <label className="d2-field">
            <span>Harvest date (optional)</span>
            <input type="date" value={harvestForm.harvestedAt} onChange={setHarvest("harvestedAt")} />
          </label>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={() => { setHarvestOpen(false); setHarvestForm(EMPTY_HARVEST); }}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={saveHarvest}
              disabled={savingHarvest || !harvestForm.cropName.trim() || !(Number(harvestForm.quantityKg) > 0)}
            >
              {savingHarvest ? "Recording…" : "Record Harvest"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
