import { useCallback, useEffect, useState } from "react";
import Icon from "../Icon.jsx";
import { api } from "../api.js";
import { Spinner } from "../components/Spinner.jsx";
import { Sparkline } from "../components/Charts.jsx";

const CAT_EMOJI = { Grains: "🌾", Vegetables: "🥦", Fruits: "🍋", Pulses: "🫘", Spices: "🌶️", Other: "🥬" };

export default function MarketPrices() {
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");

  const load = useCallback(async () => {
    try {
      const data = await api.get("/api/dashboard/market-prices");
      setPrices(data.prices || []);
    } catch {
      setPrices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = ["All", ...new Set(prices.map((p) => p.category).filter(Boolean))];
  const filtered = filter === "All" ? prices : prices.filter((p) => p.category === filter);

  if (loading) {
    return (
      <div className="d2-page d2-loading">
        <Spinner size={22} />
        <span>Loading market prices…</span>
      </div>
    );
  }

  return (
    <div className="d2-page">
      <div className="d2-card d2-page-head">
        <div>
          <h2 className="d2-marketplace-title">Market Prices</h2>
          <p className="d2-marketplace-sub">Live reference prices across Ethiopian produce markets.</p>
        </div>
      </div>

      <div className="d2-cat-tabs">
        {categories.map((cat) => (
          <button key={cat} className={`d2-cat-tab${filter === cat ? " active" : ""}`} onClick={() => setFilter(cat)}>
            {cat}
          </button>
        ))}
      </div>

      <div className="d2-card">
        <table className="d2-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Current Price</th>
              <th>Change</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const up = Number(p.change_pct) >= 0;
              return (
                <tr key={p.id}>
                  <td className="d2-cell-name">
                    <span className="d2-category-emoji">{CAT_EMOJI[p.category] || "🥬"}</span> {p.name}
                  </td>
                  <td>{p.category}</td>
                  <td className="d2-cell-price">{p.price_label}</td>
                  <td className={up ? "d2-up" : "d2-down"}>{up ? "↑" : "↓"} {Math.abs(p.change_pct)}%</td>
                  <td><Sparkline values={up ? [2, 3, 4, 5, 6] : [6, 5, 4, 3, 2]} color={up ? "#16A34A" : "#DC2626"} width={64} height={22} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length && <div className="d2-table-empty">No prices available for this category.</div>}
      </div>
    </div>
  );
}
