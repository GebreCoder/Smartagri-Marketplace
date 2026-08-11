import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import { Spinner } from "../../components/Spinner.jsx";
import { Sparkline, BarChart } from "../../components/Charts.jsx";
import { getSocket } from "../../socket.js";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

const KPI_ICONS = {
  totalOrders: "receipt-outline",
  activeOrders: "navigate-outline",
  totalSpent: "wallet-outline",
  savedProducts: "heart-outline",
  favoriteFarmers: "people-outline",
};

const KPI_COLORS = {
  totalOrders: "#16A34A",
  activeOrders: "#059669",
  totalSpent: "#0D9488",
  savedProducts: "#E11D48",
  favoriteFarmers: "#D97706",
};

const KPI_SPARK = {
  totalOrders: [3, 5, 4, 6, 7, 6, 9],
  activeOrders: [4, 4, 5, 6, 6, 7, 7],
  totalSpent: [2, 3, 5, 4, 6, 7, 8],
  savedProducts: [4, 5, 4, 5, 6, 5, 6],
  favoriteFarmers: [3, 4, 4, 5, 5, 6, 6],
};

const CAT_IMAGES = {
  Vegetables: "https://images.unsplash.com/photo-1540420773420-3366772f4999",
  Fruits: "https://images.unsplash.com/photo-1610832958506-aa56368176cf",
  Grains: "https://images.unsplash.com/photo-1500382017468-9049fed747ef",
  Coffee: "https://images.unsplash.com/photo-1447933601403-0c6688de566e",
  Spices: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d",
  Pulses: "https://images.unsplash.com/photo-1515543904379-3d757afe72e4",
  Honey: "https://images.unsplash.com/photo-1587049352846-4a222e784d38",
  Other: "https://images.unsplash.com/photo-1464226184884-fa280b87c399",
};

const ACTIVITY_ICON = {
  cart: "cart-outline",
  heart: "heart-outline",
  payment: "card-outline",
  check: "checkmark-circle-outline",
};

const fmtMoney = (v) => `ETB ${Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const OFFERS = [
  { title: "Tomatoes", sub: "12% cheaper this week", cta: "Shop Now", img: "https://images.unsplash.com/photo-1546094096-0df4bcaaa337", tag: "-12%" },
  { title: "Bulk Discount", sub: "Buy 50kg+ · Save 10%", cta: "View Deal", img: "https://images.unsplash.com/photo-1488459716781-31db52582fe9", tag: "BULK" },
  { title: "Fresh Harvest", sub: "New potatoes just arrived", cta: "Shop Now", img: "https://images.unsplash.com/photo-1518977676601-b53f82aba655", tag: "NEW" },
  { title: "Seasonal Offer", sub: "Up to 15% off grains", cta: "View Offers", img: "https://images.unsplash.com/photo-1500382017468-9049fed747ef", tag: "-15%" },
];

const WELCOME_IMG = "https://images.unsplash.com/photo-1540420773420-3366772f4999";

export default function BuyerHome() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState(new Set());
  const [aiParagraph, setAiParagraph] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await api.get("/api/dashboard/buyer");
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Real LLM insight paragraph when a key is configured (rules fallback otherwise).
  useEffect(() => {
    if (!data?.aiInsights?.length) return;
    const context =
      `Total orders: ${data.kpis?.totalOrders?.value ?? 0}. Total spent: ${data.kpis?.totalSpent?.value ?? 0} ETB. ` +
      `Favorite farmers: ${data.kpis?.favoriteFarmers?.value ?? 0}. Recent purchases: ${data.activity.map((a) => a.text).join("; ") || "none"}.`;
    api
      .post("/api/dashboard/ai-insight", {
        role: "buyer",
        context,
        fallback: data.aiInsights[0]?.text || "Check the market trends to find this week's best deals.",
      })
      .then((result) => setAiParagraph(result))
      .catch(() => setAiParagraph(null));
  }, [data]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    let mounted = true;
    api
      .get("/api/dashboard/favorites")
      .then((data) => {
        if (mounted) setFavorites(new Set((data.products || []).map((p) => p.id)));
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      mounted = false;
    };
  }, []);

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

  const toggleFavorite = async (productId) => {
    if (!productId) return;
    const next = new Set(favorites);
    if (next.has(productId)) {
      next.delete(productId);
    } else {
      next.add(productId);
      try {
        await api.post("/api/dashboard/favorites", { productId });
      } catch {
        /* ignore */
      }
    }
    setFavorites(next);
  };

  const kpiEntries = useMemo(() => (data?.kpis ? Object.entries(data.kpis) : []), [data]);

  const formatKpiValue = (kpi) => {
    if (kpi.format === "money") return fmtMoney(kpi.value);
    return Number(kpi.value).toLocaleString("en-US");
  };

  if (loading) {
    return (
      <div className="d2-page d2-loading">
        <Spinner size={22} />
        <span>Loading your marketplace…</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="d2-page">
        <div className="empty-state">
          <Icon name="basket-outline" size={38} color="#7A8E81" />
          <h3>Could not load your dashboard</h3>
          <p>Please try again in a moment.</p>
        </div>
      </div>
    );
  }

  const { user, kpis, recommended, activeOrders, spending, categories, aiInsights, marketTrends, favoriteFarmers, activity, dateLabel } = data;
  const firstName = String(user?.full_name || "Buyer").split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="d2-page">
      {/* ── Welcome banner ── */}
      <div className="d2-card d2-buyer-welcome">
        <div className="d2-welcome-copy">
          <div className="d2-welcome-title">{greeting}, {firstName} 👋</div>
          <div className="d2-welcome-sub">Discover fresh products directly from trusted farmers.</div>
          <div className="d2-welcome-date">
            <Icon name="calendar-outline" size={14} /> {dateLabel}
          </div>
          <div className="d2-buyer-welcome-actions">
            <button className="d2-btn-primary" onClick={() => navigate("/buyer/marketplace")}>
              <Icon name="search-outline" size={15} /> Search Products
            </button>
            <button className="d2-btn-secondary" onClick={() => navigate("/buyer/marketplace")}>
              Browse Marketplace
            </button>
          </div>
        </div>
        <div className="d2-buyer-welcome-art">
          <img src={WELCOME_IMG} alt="Fresh produce" />
          <div className="d2-welcome-tag">100% Fresh · Farm to Table</div>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="d2-kpi-grid d2-kpi-grid-5">
        {kpiEntries.map(([key, kpi]) => {
          const positive = Number(kpi.delta) >= 0;
          return (
            <div className="d2-kpi" key={key}>
              <div className="d2-kpi-top">
                <span className="d2-kpi-icon" style={{ background: `${KPI_COLORS[key]}1A`, color: KPI_COLORS[key] }}>
                  <Icon name={KPI_ICONS[key] || "stats-chart-outline"} size={18} />
                </span>
                <Sparkline values={KPI_SPARK[key] || [3, 4, 5, 4, 6, 5, 7]} color={KPI_COLORS[key]} />
              </div>
              <div className="d2-kpi-label">{kpi.label}</div>
              <div className="d2-kpi-value">{formatKpiValue(kpi)}</div>
              {kpi.delta != null ? (
                <div className={`d2-kpi-delta ${positive ? "up" : "down"}`}>
                  <Icon name={positive ? "arrow-up" : "arrow-down"} size={12} />
                  {Math.abs(kpi.delta)}% vs last 30 days
                </div>
              ) : (
                <div className="d2-kpi-delta neutral">{kpi.caption || ""}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Recommended products ── */}
      <div className="d2-card d2-recommended-card">
        <div className="d2-card-head">
          <div className="d2-card-title">Recommended For You</div>
          <button className="d2-link-btn" onClick={() => navigate("/buyer/marketplace")}>View All Products</button>
        </div>
        <div className="d2-products-grid">
          {recommended.map((product) => {
            const isFav = favorites.has(product.id);
            return (
              <div className="d2-product-card" key={product.id} onClick={() => navigate(`/buyer/product-details/${product.id}`)}>
                <div className="d2-product-img-wrap">
                  <img src={product.image_url || FALLBACK_IMAGE} alt={product.name} loading="lazy" />
                  {product.is_organic && <span className="d2-badge-fresh">Organic</span>}
                  <button
                    className={`d2-fav-btn${isFav ? " active" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleFavorite(product.id);
                    }}
                    aria-label="Save to favorites"
                  >
                    <Icon name={isFav ? "heart" : "heart-outline"} size={17} color={isFav ? "#E11D48" : "#475569"} />
                  </button>
                </div>
                <div className="d2-product-body">
                  <div className="d2-product-name">{product.name}</div>
                  <div className="d2-product-farm">
                    <Icon name="location-outline" size={12} /> {product.farmer_name} · {product.location}
                  </div>
                  <div className="d2-product-meta">
                    <span className="d2-rating">
                      <Icon name="star" size={12} color="#F59E0B" /> {product.rating}
                      <em>({product.reviews})</em>
                    </span>
                    <span className="d2-in-stock">{product.in_stock ? "In Stock" : "Out of Stock"}</span>
                  </div>
                  <div className="d2-product-foot">
                    <span className="d2-product-price">{product.price_label}</span>
                    <button className="d2-btn-primary-sm" onClick={(event) => {
                      event.stopPropagation();
                      navigate(`/buyer/product-details/${product.id}`);
                    }}>
                      <Icon name="cart-outline" size={13} /> Add to Cart
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Active orders + spending + favorite farmers ── */}
      <div className="d2-grid-bottom">
        <div className="d2-card d2-active-orders-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Active Orders</div>
            <button className="d2-link-btn" onClick={() => navigate("/buyer/orders")}>View All Orders</button>
          </div>
          {activeOrders.length ? (
            <div className="d2-order-steps-list">
              {activeOrders.map((order) => (
                <div className="d2-order-step-card" key={order.displayId}>
                  <div className="d2-order-step-top">
                    <div className="d2-order-step-product">
                      <img src={order.image_url || FALLBACK_IMAGE} alt={order.product} />
                      <div>
                        <div className="d2-order-step-name">{order.product} <span className="d2-cell-id">{order.displayId}</span></div>
                        <div className="d2-order-step-meta">{order.quantity} · {order.amount}</div>
                      </div>
                    </div>
                    <span className="d2-status st-shipped">{order.status}</span>
                  </div>
                  <div className="d2-tracker">
                    {order.steps.map((step, index) => (
                      <div className={`d2-tracker-step${step.done ? " done" : ""}${step.current ? " current" : ""}`} key={step.label}>
                        <span className="d2-tracker-dot">{step.done ? <Icon name="checkmark-outline" size={10} /> : index + 1}</span>
                        <span className="d2-tracker-label">{step.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="d2-order-step-foot">{order.est_delivery}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="d2-table-empty">No active orders — start shopping to see tracking here.</div>
          )}
        </div>

        <div className="d2-card d2-spending-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Your Spending</div>
            <div className="d2-range-pills">
              <button className="d2-range-pill active">Monthly</button>
            </div>
          </div>
          <BarChart labels={spending.labels} values={spending.values} height={150} />
          <div className="d2-spending-foot">
            <div>
              <div className="d2-spending-total">{fmtMoney(spending.total)}</div>
              <div className="d2-kpi-delta up"><Icon name="arrow-up" size={12} /> {spending.delta}% vs last month</div>
            </div>
            <span className="d2-spending-note">Last 6 months</span>
          </div>
        </div>

        <div className="d2-card d2-farmers-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Favorite Farmers</div>
            <button className="d2-link-btn" onClick={() => navigate("/buyer/marketplace")}>View All</button>
          </div>
          <div className="d2-farmers-list">
            {favoriteFarmers.slice(0, 3).map((farmer) => (
              <div className="d2-farmer" key={farmer.id}>
                <img src={farmer.image_url || FALLBACK_IMAGE} alt={farmer.name} />
                <div className="d2-farmer-body">
                  <div className="d2-farmer-name">
                    {farmer.name}
                    <Icon name="shield-checkmark-outline" size={13} color="#16A34A" />
                  </div>
                  <div className="d2-farmer-loc">
                    <Icon name="location-outline" size={12} /> {farmer.location}
                  </div>
                </div>
                <div className="d2-farmer-right">
                  <span className="d2-rating"><Icon name="star" size={11} color="#F59E0B" /> {farmer.rating}</span>
                  <button className="d2-btn-primary-sm">Following</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Categories + AI + market trends ── */}
      <div className="d2-grid-4">
        <div className="d2-card d2-categories-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Shop by Category</div>
            <button className="d2-link-btn" onClick={() => navigate("/buyer/marketplace")}>View All</button>
          </div>
          <div className="d2-categories">
            {categories.map((cat) => (
              <button className="d2-category" key={cat.name} onClick={() => navigate(`/buyer/marketplace?category=${encodeURIComponent(cat.name)}`)}>
                <span className="d2-category-emoji">{cat.emoji}</span>
                <span className="d2-category-name">{cat.name}</span>
                <span className="d2-category-count">{cat.count} items</span>
              </button>
            ))}
          </div>
        </div>

        <div className="d2-card d2-ai-card">
          <div className="d2-card-head">
            <div className="d2-card-title">
              <Icon name="sparkles" size={15} color="#16A34A" /> AgriSpark AI Assistant
            </div>
            <span className="d2-new-badge">New</span>
          </div>
          <div className="d2-insights">
            {aiParagraph?.text && (
              <div className="d2-insight d2-insight-hero">
                <span className="d2-insight-icon"><Icon name="sparkles" size={15} color="#16A34A" /></span>
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
                <span className="d2-insight-icon"><Icon name="sparkles-outline" size={15} /></span>
                <div className="d2-insight-text">{insight.text}</div>
              </div>
            ))}
          </div>
          <button className="d2-link-btn" onClick={() => navigate("/buyer/marketplace")}>See More Insights</button>
        </div>

        <div className="d2-card d2-market-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Market Trends</div>
            <button className="d2-link-btn" onClick={() => navigate("/buyer/marketplace")}>View All</button>
          </div>
          <table className="d2-table d2-table-sm">
            <thead>
              <tr>
                <th>Product</th><th>Price</th><th>Change</th><th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {marketTrends.map((p) => {
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

        <div className="d2-card d2-activity-card">
          <div className="d2-card-head">
            <div className="d2-card-title">Recent Activity</div>
            <button className="d2-link-btn" onClick={() => navigate("/buyer/orders")}>View All Activity</button>
          </div>
          <div className="d2-activity">
            {activity.map((item, index) => (
              <div className="d2-activity-item" key={index}>
                <span className="d2-activity-icon">
                  <Icon name={ACTIVITY_ICON[item.icon] || "ellipse-outline"} size={15} />
                </span>
                <div className="d2-activity-body">
                  <div className="d2-activity-text">{item.text}</div>
                  <div className="d2-activity-date">{item.date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Offers & deals ── */}
      <div className="d2-card d2-offers-card">
        <div className="d2-card-head">
          <div className="d2-card-title">Offers &amp; Deals</div>
        </div>
        <div className="d2-offers">
          {OFFERS.map((offer) => (
            <div className="d2-offer" key={offer.title} onClick={() => navigate("/buyer/marketplace")}>
              <img src={offer.img} alt={offer.title} loading="lazy" />
              <span className="d2-offer-tag">{offer.tag}</span>
              <div className="d2-offer-body">
                <div className="d2-offer-title">{offer.title}</div>
                <div className="d2-offer-sub">{offer.sub}</div>
                <button className="d2-link-btn">{offer.cta} <Icon name="chevron-forward" size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
