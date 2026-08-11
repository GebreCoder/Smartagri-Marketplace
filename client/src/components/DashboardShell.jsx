import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import Icon from "../Icon.jsx";
import { api, setToken } from "../api.js";
import { useAuth } from "../auth.jsx";
import { getSocket } from "../socket.js";

const getInitials = (name) => {
  const value = String(name || "").trim();
  if (!value) return "U";
  return value.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
};

// Each item maps to exactly one real destination and is matched exactly
// (end: true) so selecting one sidebar entry never highlights its neighbors.
const FARMER_NAV = [
  { section: "MAIN", items: [
    { to: "/farmer", end: true, label: "Dashboard", icon: "grid-outline" },
    { to: "/farmer/products", end: true, label: "My Products", icon: "cube-outline" },
    { to: "/farmer/create", end: true, label: "Add Product", icon: "add-circle-outline" },
    { to: "/farmer/orders", end: true, label: "Orders", icon: "receipt-outline" },
    { to: "/farmer/analytics", end: true, label: "Analytics", icon: "bar-chart-outline" },
  ]},
  { section: "FARM MANAGEMENT", items: [
    { to: "/farmer/crops", end: true, label: "Crops", icon: "flower-outline" },
    { to: "/farmer/calendar", end: true, label: "Farm Calendar", icon: "calendar-outline" },
  ]},
  { section: "SMART AGRICULTURE", items: [
    { to: "/farmer/market-prices", end: true, label: "Market Prices", icon: "pricetag-outline" },
  ]},
  { section: "COMMUNICATION", items: [
    { to: "/farmer/chat", end: true, label: "Messages", icon: "chatbubbles-outline", badgeKey: "messages" },
  ]},
  { section: "ACCOUNT", items: [
    { to: "/profile", end: true, label: "Settings", icon: "settings-outline" },
  ]},
];

const BUYER_NAV = [
  { section: "MAIN", items: [
    { to: "/buyer", end: true, label: "Dashboard", icon: "grid-outline" },
    { to: "/buyer/marketplace", end: true, label: "Marketplace", icon: "storefront-outline" },
    { to: "/buyer/orders", end: true, label: "My Orders", icon: "receipt-outline" },
    { to: "/buyer/favorites", end: true, label: "Favorites", icon: "heart-outline" },
  ]},
  { section: "SHOPPING", items: [
    { to: "/buyer/cart", end: true, label: "Cart", icon: "cart-outline", badgeKey: "cart" },
  ]},
  { section: "SMART AGRICULTURE", items: [
    { to: "/buyer/market-prices", end: true, label: "Market Prices", icon: "pricetag-outline" },
  ]},
  { section: "COMMUNICATION", items: [
    { to: "/buyer/chat", end: true, label: "Messages", icon: "chatbubbles-outline", badgeKey: "messages" },
  ]},
  { section: "ACCOUNT", items: [
    { to: "/profile", end: true, label: "Settings", icon: "settings-outline" },
  ]},
];

export default function DashboardShell({ role = "farmer" }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isBuyer = role === "buyer";
  const nav = isBuyer ? BUYER_NAV : FARMER_NAV;
  const searchPlaceholder = isBuyer ? "Search products, farmers, categories..." : "Search anything...";

  const [profile, setProfile] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [messagesCount, setMessagesCount] = useState(0);
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [priceAlerts, setPriceAlerts] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const notifRef = useRef(null);
  const [dark, setDark] = useState(() => {
    // Apply synchronously before first paint to avoid a flash of light theme.
    try {
      const stored = localStorage.getItem("agrispark_theme");
      const isDark = stored === "dark";
      document.documentElement.setAttribute("data-theme", stored || "light");
      return isDark;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    try {
      localStorage.setItem("agrispark_theme", dark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [dark]);

  // Close the notification panel on outside click or Escape.
  useEffect(() => {
    if (!notifOpen) return undefined;
    const onPointerDown = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) setNotifOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setNotifOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [notifOpen]);

  const badges = { cart: cartCount, messages: messagesCount, notifications: notificationsCount };

  const loadBadges = useCallback(async () => {
    try {
      if (isBuyer) {
        const { items } = await api.get("/api/cart");
        setCartCount(items.reduce((s, i) => s + Number(i.quantity || 0), 0));
        const { orders } = await api.get("/api/orders/buyer");
        const pendingOrders = orders.filter((o) => String(o.rawStatus).toLowerCase() === "pending").length;
        // Price-drop alerts on favorited products feed the same bell.
        let alertCount = 0;
        try {
          const { priceAlerts: alerts } = await api.get("/api/dashboard/buyer/insights");
          setPriceAlerts(alerts || []);
          alertCount = (alerts || []).length;
        } catch {
          /* bell still shows order notifications */
        }
        setNotificationsCount(pendingOrders + alertCount);
      } else {
        const { orders } = await api.get("/api/orders/farmer");
        setNotificationsCount(orders.filter((o) => String(o.rawStatus).toLowerCase() === "pending").length);
      }
      const { conversations } = await api.get("/api/chat/direct");
      const unreadCount = conversations.filter((c) => Number(c.unread || 0) > 0).length;
      setMessagesCount(unreadCount || Math.min(conversations.length, 5));
    } catch {
      // badges stay at zero when endpoints fail
    }
  }, [isBuyer]);

  const loadProfile = useCallback(async () => {
    try {
      const { user: data } = await api.get("/api/auth/me");
      setProfile(data);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadBadges();
  }, [loadProfile, loadBadges]);

  useEffect(() => {
    const socket = getSocket();
    const onChange = () => loadBadges();
    socket.on("order:changed", onChange);
    socket.on("message:new", onChange);
    socket.on("product:changed", onChange);
    return () => {
      socket.off("order:changed", onChange);
      socket.off("message:new", onChange);
      socket.off("product:changed", onChange);
    };
  }, [loadBadges]);

  const displayName = profile?.full_name || user?.full_name || (isBuyer ? "Buyer" : "Farmer");
  const roleLabel = isBuyer ? "Premium Buyer" : "Premium Farmer";
  const initials = getInitials(displayName);
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  const handleSearch = (e) => {
    e.preventDefault();
    const q = search.trim();
    if (isBuyer) navigate(q ? `/buyer/marketplace?search=${encodeURIComponent(q)}` : "/buyer/marketplace");
    else navigate(q ? `/farmer/products?search=${encodeURIComponent(q)}` : "/farmer/products");
  };

  const handleLogout = () => {
    setToken("");
    navigate("/login-register?mode=login");
  };

  return (
    <div className="d2-app">
      <aside className="d2-sidebar">
        <Link to={isBuyer ? "/buyer" : "/farmer"} className="d2-brand">
          <span className="d2-brand-logo">
            <Icon name="leaf" size={18} color="#fff" />
          </span>
          <span className="d2-brand-name">AgriSpark</span>
        </Link>

        <nav className="d2-nav">
          {nav.map((group) => (
            <div className="d2-nav-group" key={group.section}>
              <div className="d2-nav-label">{group.section}</div>
              {group.items.map((item) => {
                const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                return (
                  <NavLink
                    key={item.label}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `d2-nav-item${isActive ? " d2-nav-active" : ""}`}
                  >
                    <Icon name={item.icon} size={16} />
                    <span className="d2-nav-text">{item.label}</span>
                    {badge > 0 && <span className="d2-nav-badge">{badge > 99 ? "99+" : badge}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="d2-sidebar-footer">
          <div className="d2-sidebar-user">
            {profile?.profile_image_url ? (
              <img src={profile.profile_image_url} alt={displayName} className="d2-mini-avatar" />
            ) : (
              <span className="d2-mini-avatar">{initials}</span>
            )}
            <div className="d2-mini-info">
              <div className="d2-mini-name">{displayName}</div>
              <div className="d2-mini-role">{roleLabel}</div>
            </div>
            <button className="d2-logout" onClick={handleLogout} aria-label="Sign out">
              <Icon name="log-out-outline" size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="d2-main">
        <header className="d2-header">
          <div className="d2-header-title">
            <div className="d2-title">{isBuyer ? "Buyer Dashboard" : "Farmer Dashboard"}</div>
            <div className="d2-title-sub">{greeting}, {displayName}</div>
          </div>

          <form className="d2-search" onSubmit={handleSearch}>
            <Icon name="search-outline" size={16} color="#94A3B8" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label="Search"
            />
          </form>

          <div className="d2-header-actions">
            <button
              className="d2-hicon d2-theme-toggle"
              onClick={() => setDark((v) => !v)}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              title={dark ? "Light mode" : "Dark mode"}
            >
              <Icon name={dark ? "sunny-outline" : "moon-outline"} size={18} />
            </button>
            {isBuyer && (
              <Link to="/buyer/cart" className="d2-hicon">
                <Icon name="cart-outline" size={19} />
                {cartCount > 0 && <span className="d2-hbadge">{cartCount}</span>}
              </Link>
            )}
            <Link to={isBuyer ? "/buyer/favorites" : "/farmer/crops"} className="d2-hicon">
              <Icon name="heart-outline" size={19} />
            </Link>
            <div className="d2-notif-wrap" ref={notifRef}>
              <button
                className="d2-hicon"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label="Notifications"
                aria-haspopup="menu"
                aria-expanded={notifOpen}
              >
                <Icon name="notifications-outline" size={19} />
                {notificationsCount > 0 && <span className="d2-hbadge d2-hbadge-red">{notificationsCount}</span>}
              </button>
              {notifOpen && (
                <div className="d2-dropdown d2-notif-panel" role="menu">
                  <div className="d2-notif-title">Notifications</div>
                  {isBuyer && priceAlerts.length > 0 && (
                    <>
                      <div className="d2-notif-group">Price drop alerts</div>
                      {priceAlerts.map((alert) => (
                        <button
                          className="d2-notif-item"
                          key={alert.productId}
                          onClick={() => {
                            setNotifOpen(false);
                            navigate(`/buyer/product-details/${alert.productId}`);
                          }}
                        >
                          <img src={alert.image_url} alt={alert.name} />
                          <div className="d2-notif-body">
                            <div className="d2-notif-text">{alert.name} dropped to {alert.new_price_label}</div>
                            <div className="d2-notif-sub">↓ {alert.drop_pct}% — tap to view</div>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                  <div className="d2-notif-group">{isBuyer ? "Order updates" : "Order updates"}</div>
                  <button className="d2-notif-item d2-notif-link" onClick={() => { setNotifOpen(false); navigate(isBuyer ? "/buyer/orders" : "/farmer/orders"); }}>
                    <Icon name="receipt-outline" size={16} />
                    <div className="d2-notif-body">
                      <div className="d2-notif-text">View your orders</div>
                      <div className="d2-notif-sub">Track status, confirm delivery, report issues</div>
                    </div>
                  </button>
                  {notificationsCount === 0 && (
                    <div className="d2-notif-empty">You&apos;re all caught up ✨</div>
                  )}
                </div>
              )}
            </div>
            <Link to={isBuyer ? "/buyer/chat" : "/farmer/chat"} className="d2-hicon">
              <Icon name="chatbubbles-outline" size={19} />
              {messagesCount > 0 && <span className="d2-hbadge d2-hbadge-blue">{messagesCount}</span>}
            </Link>

            <div className="d2-profile-wrap">
              <button className="d2-profile" onClick={() => setMenuOpen((v) => !v)}>
                {profile?.profile_image_url ? (
                  <img src={profile.profile_image_url} alt={displayName} className="d2-profile-avatar" />
                ) : (
                  <span className="d2-profile-avatar">{initials}</span>
                )}
                <span className="d2-profile-meta">
                  <span className="d2-profile-name">{displayName}</span>
                  <span className="d2-profile-role">{roleLabel}</span>
                </span>
                <Icon name="chevron-down" size={14} color="#64748B" />
              </button>
              {menuOpen && (
                <div className="d2-dropdown">
                  <button onClick={() => { setMenuOpen(false); navigate("/profile"); }}>
                    <Icon name="person-outline" size={15} /> My Profile
                  </button>
                  <button onClick={() => { setMenuOpen(false); navigate(isBuyer ? "/buyer/orders" : "/farmer/orders"); }}>
                    <Icon name="receipt-outline" size={15} /> My Orders
                  </button>
                  <button onClick={() => { setMenuOpen(false); handleLogout(); }}>
                    <Icon name="log-out-outline" size={15} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="d2-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
