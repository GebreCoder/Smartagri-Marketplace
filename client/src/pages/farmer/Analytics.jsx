import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import { Spinner } from "../../components/Spinner.jsx";
import { AreaChart, DonutChart, ProgressBar } from "../../components/Charts.jsx";
import { getSocket } from "../../socket.js";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

const SUMMARY_ICONS = {
  totalRevenue: { icon: "cash-outline", color: "#16A34A", label: "Total Revenue", labelKey: "totalRevenue_label" },
  totalOrders: { icon: "receipt-outline", color: "#059669", label: "Total Orders" },
  uniqueBuyers: { icon: "people-outline", color: "#0D9488", label: "Unique Buyers" },
  repeatRate: { icon: "refresh-outline", color: "#8B5CF6", label: "Repeat Customer Rate" },
  avgOrderValue: { icon: "wallet-outline", color: "#F59E0B", label: "Avg Order Value" },
  fulfillmentRate: { icon: "checkmark-done-outline", color: "#16A34A", label: "Fulfillment Rate" },
  totalHarvest: { icon: "basket-outline", color: "#D97706", label: "Total Harvested" },
  acceptedOrders: { icon: "checkmark-circle-outline", color: "#10B981", label: "Fulfilled Orders" },
};

// Escape a cell for CSV (quotes, commas, newlines) and guard against
// spreadsheet formula injection (values starting with = + - @).
const csvCell = (value) => {
  const text = String(value ?? "");
  const guarded = /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
  return /[,"\n]/.test(guarded) ? `"${guarded.replace(/"/g, "\"\"")}"` : guarded;
};

// Build + download a CSV report of the analytics data.
const exportCsv = (data) => {
  if (!data) return;
  const { summary, topProducts, topBuyers, trend, categorySales, statusBreakdown } = data;
  const rows = [];
  const push = (cells) => rows.push(cells.map(csvCell).join(","));

  push(["AgriSpark Farm Analytics Report"]);
  push([`Generated ${new Date().toLocaleString()}`]);
  push([]);
  push(["Metric", "Value"]);
  push(["Total Revenue", summary.totalRevenue_label]);
  push(["Total Orders", summary.totalOrders]);
  push(["Fulfilled Orders", summary.acceptedOrders]);
  push(["Unique Buyers", summary.uniqueBuyers]);
  push(["Repeat Customer Rate", `${summary.repeatRate}%`]);
  push(["Avg Order Value", summary.avgOrderValue]);
  push(["Fulfillment Rate", `${summary.fulfillmentRate}%`]);
  push(["Total Harvested", summary.totalHarvest]);
  push([]);

  push(["Monthly Trend"]);
  push(["Month", "Revenue (ETB)", "Orders"]);
  trend.labels.forEach((label, i) => push([label, trend.revenue[i], trend.orders[i]]));
  push([]);

  push(["Top Products by Revenue"]);
  push(["Product", "Category", "Orders", "Units Sold (kg)", "Revenue (ETB)", "Share %"]);
  topProducts.forEach((p) => push([p.name, p.category, p.orders, p.units, p.revenue, p.share]));
  push([]);

  push(["Order Status"]);
  statusBreakdown.forEach((s) => push([s.label, s.count]));
  push([]);

  push(["Sales by Category"]);
  push(["Category", "Revenue (ETB)", "Share %"]);
  categorySales.forEach((c) => push([c.category, c.value, c.pct]));
  push([]);

  push(["Top Buyers"]);
  push(["Buyer", "Orders", "Spend (ETB)"]);
  topBuyers.forEach((b) => push([b.name, b.orders, b.spend]));

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `agrispark-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export default function FarmerAnalytics() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const result = await api.get("/api/dashboard/farmer/analytics");
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const onChange = () => load();
    socket.on("order:changed", onChange);
    socket.on("product:changed", onChange);
    return () => {
      socket.off("order:changed", onChange);
      socket.off("product:changed", onChange);
    };
  }, []);

  if (loading) {
    return (
      <div className="d2-page d2-loading">
        <Spinner size={22} />
        <span>Crunching your farm analytics…</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="d2-page">
        <div className="empty-state">
          <Icon name="stats-chart-outline" size={38} color="#7A8E81" />
          <h3>Could not load analytics</h3>
          <p>Please try again in a moment.</p>
        </div>
      </div>
    );
  }

  const { summary, topProducts, statusBreakdown, topBuyers, trend, categorySales } = data;
  const maxProductRevenue = Math.max(...topProducts.map((p) => p.revenue), 1);

  return (
    <div className="d2-page">
      <div className="d2-analytics-head">
        <div>
          <div className="d2-title">Sales &amp; Analytics</div>
          <div className="d2-title-sub">Deep insights into your farm&apos;s performance</div>
        </div>
        <div className="d2-analytics-actions">
          <button className="d2-btn-secondary" onClick={() => exportCsv(data)}>
            <Icon name="download-outline" size={15} /> Export CSV
          </button>
          <button className="d2-btn-secondary" onClick={() => navigate("/farmer")}>
            <Icon name="arrow-back-outline" size={15} /> Back to Dashboard
          </button>
        </div>
      </div>

      <div className="d2-kpi-grid">
        {Object.entries(SUMMARY_ICONS).map(([key, meta]) => (
          <div className="d2-kpi" key={key}>
            <div className="d2-kpi-top">
              <span className="d2-kpi-icon" style={{ background: `${meta.color}1A`, color: meta.color }}>
                <Icon name={meta.icon} size={18} />
              </span>
            </div>
            <div className="d2-kpi-label">{meta.label}</div>
            <div className="d2-kpi-value">{summary[meta.labelKey || key] ?? summary[key] ?? "—"}</div>
            <div className="d2-kpi-delta neutral">&nbsp;</div>
          </div>
        ))}
      </div>

      <div className="d2-grid-4">
        <div className="d2-card d2-span-2">
          <div className="d2-card-head">
            <div className="d2-card-title">Revenue &amp; Orders — 12 Months</div>
          </div>
          <div className="d2-chart-legend">
            <span className="d2-legend-item"><i style={{ background: "#16A34A" }} /> Revenue (ETB)</span>
            <span className="d2-legend-item"><i style={{ background: "#F59E0B" }} /> Orders</span>
          </div>
          <AreaChart labels={trend.labels} revenue={trend.revenue} orders={trend.orders} />
        </div>

        <div className="d2-card d2-donut-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Order Status</div>
          </div>
          <div className="d2-donut-wrap">
            <DonutChart
              items={statusBreakdown.map((s) => ({ label: s.label, pct: summary.totalOrders > 0 ? Math.round((s.count / summary.totalOrders) * 100) : 0, color: s.color }))}
              size={150}
              thickness={20}
              centerLabel="Total Orders"
              centerValue={String(summary.totalOrders)}
            />
            <div className="d2-donut-legend">
              {statusBreakdown.map((s) => (
                <div className="d2-donut-legend-row" key={s.status}>
                  <span className="d2-dot" style={{ background: s.color }} />
                  <span className="d2-donut-label">{s.label}</span>
                  <span className="d2-donut-value">{s.count} orders</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="d2-card d2-category-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Sales by Category</div>
          </div>
          <div className="d2-category-bars">
            {categorySales.length ? (
              categorySales.map((cat) => (
                <div className="d2-cat-bar" key={cat.category}>
                  <div className="d2-cat-bar-top">
                    <span className="d2-cat-bar-name">{cat.category}</span>
                    <span className="d2-cat-bar-value">{cat.value_label} · {cat.pct}%</span>
                  </div>
                  <ProgressBar value={cat.pct} color={cat.color} height={8} />
                </div>
              ))
            ) : (
              <div className="d2-table-empty">No accepted sales yet.</div>
            )}
          </div>
        </div>

        <div className="d2-card d2-category-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Production Mix</div>
          </div>
          <div className="d2-donut-wrap">
            <DonutChart
              items={categorySales.map((c) => ({ label: c.category, pct: c.pct, color: c.color }))}
              size={140}
              thickness={18}
              centerLabel="Revenue Mix"
              centerValue={`${summary.fulfillmentRate}%`}
            />
          </div>
        </div>
      </div>

      <div className="d2-grid-bottom">
        <div className="d2-card d2-top-products-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Top Products by Revenue</div>
            <button className="d2-link-btn" onClick={() => navigate("/farmer/products")}>Manage Products</button>
          </div>
          {topProducts.length ? (
            <div className="d2-top-products">
              {topProducts.map((p) => (
                <div className="d2-top-product" key={p.id}>
                  <img src={p.image_url || FALLBACK_IMAGE} alt={p.name} className="d2-top-product-img" />
                  <div className="d2-top-product-body">
                    <div className="d2-top-product-top">
                      <span className="d2-top-product-name">{p.name}</span>
                      <span className="d2-top-product-revenue">{p.revenue_label}</span>
                    </div>
                    <div className="d2-top-product-meta">
                      {p.orders} order{p.orders === 1 ? "" : "s"} · {p.units} kg sold
                    </div>
                    <div className="d2-top-product-bar">
                      <div className="d2-top-product-fill" style={{ width: `${Math.round((p.revenue / maxProductRevenue) * 100)}%` }} />
                    </div>
                  </div>
                  <span className="d2-top-product-share">{p.share}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="d2-table-empty">No products yet — add your first product to see analytics.</div>
          )}
        </div>

        <div className="d2-card d2-top-buyers-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Top Buyers</div>
            <div className="d2-new-badge">{summary.repeatRate}% repeat</div>
          </div>
          {topBuyers.length ? (
            <table className="d2-table d2-table-sm">
              <thead>
                <tr>
                  <th>Buyer</th>
                  <th>Orders</th>
                  <th>Spend</th>
                </tr>
              </thead>
              <tbody>
                {topBuyers.map((buyer) => (
                  <tr key={buyer.id}>
                    <td className="d2-cell-name">{buyer.name}</td>
                    <td>{buyer.orders}</td>
                    <td className="d2-cell-price">{buyer.spend_label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="d2-table-empty">No customers yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
