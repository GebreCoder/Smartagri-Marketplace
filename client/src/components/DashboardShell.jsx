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

const FARMER_NAV = [
  { section: "MAIN", items: [
    { to: "/farmer", end: true, label: "Dashboard", icon: "grid-outline" },
    { to: "/farmer/products", label: "My Products", icon: "cube-outline" },
    { to: "/farmer/create", label: "Add Product", icon: "add-circle-outline" },
    { to: "/farmer/orders", label: "Orders", icon: "receipt-outline" },
    { to: "/farmer/orders", label: "Customers", icon: "people-outline" },
    { to: "/farmer/products", label: "Inventory", icon: "layers-outline" },
    { to: "/farmer", label: "Sales & Revenue", icon: "stats-chart-outline" },
    { to: "/farmer", label: "Analytics", icon: "bar-chart-outline" },
  ]},
  { section: "FARM MANAGEMENT", items: [
    { to: "/farmer/crops", label: "My Farm", icon: "leaf-outline" },
    { to: "/farmer/crops", label: "Crops", icon: "flower-outline" },
    { to: "/farmer/calendar", label: "Farm Activities", icon: "calendar-outline" },
    { to: "/farmer/crops", label: "Harvests", icon: "basket-outline" },
    { to: "/farmer/calendar", label: "Farm Calendar", icon: "calendar-outline" },
  ]},
  { section: "SMART AGRICULTURE", items: [
    { to: "/farmer", label: "Weather", icon: "partly-sunny-outline" },
    { to: "/farmer/crops", label: "Crop Health", icon: "heart-outline" },
    { to: "/farmer", label: "AI Recommendations", icon: "sparkles-outline" },
    { to: "/farmer/market-prices", label: "Market Prices", icon: "pricetag-outline" },
  ]},
  { section: "COMMUNICATION", items: [
    { to: "/farmer/chat", label: "Messages", icon: "chatbubbles-outline", badgeKey: "messages" },
    { to: "/farmer/orders", label: "Notifications", icon: "notifications-outline", badgeKey: "notifications" },
  ]},
  { section: "ACCOUNT", items: [
    { to: "/profile", label: "Settings", icon: "settings-outline" },
    { to: "/", label: "Help & Support", icon: "help-circle-outline" },
  ]},
];

const BUYER_NAV = [
  { section: "MAIN", items: [
    { to: "/buyer", end: true, label: "Dashboard", icon: "grid-outline" },
    { to: "/buyer/marketplace", label: "Marketplace", icon: "storefront-outline" },
    { to: "/buyer/marketplace", label: "Browse Products", icon: "search-outline" },
    { to: "/buyer/marketplace", label: "Categories", icon: "pricetag-outline" },
    { to: "/buyer/orders", label: "My Orders", icon: "receipt-outline" },
    { to: "/buyer/favorites", label: "Favorites", icon: "heart-outline" },
  ]},
  { section: "SHOPPING", items: [
    { to: "/buyer/cart", label: "Cart", icon: "cart-outline", badgeKey: "cart" },
    { to: "/buyer/favorites", label: "Saved Items", icon: "bookmark-outline" },
    { to: "/buyer/marketplace", label: "Recently Viewed", icon: "time-outline" },
    { to: "/buyer", label: "Deals & Offers", icon: "pricetag-outline" },
  ]},
  { section: "PURCHASING", items: [
    { to: "/buyer/orders", label: "Purchase History", icon: "document-text-outline" },
    { to: "/buyer/orders", label: "Invoices", icon: "document-text-outline" },
    { to: "/buyer/orders", label: "Payments", icon: "card-outline" },
    { to: "/profile", label: "Addresses", icon: "location-outline" },
  ]},
  { section: "COMMUNICATION", items: [
    { to: "/buyer/chat", label: "Messages", icon: "chatbubbles-outline", badgeKey: "messages" },
    { to: "/buyer/orders", label: "Notifications", icon: "notifications-outline", badgeKey: "notifications" },
  ]},
  { section: "ACCOUNT", items: [
    { to: "/profile", label: "Settings", icon: "settings-outline" },
    { to: "/", label: "Help & Support", icon: "help-circle-outline" },
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
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const badges = { cart: cartCount, messages: messagesCount, notifications: notificationsCount };

  const loadBadges = useCallback(async () => {
    try {
      if (isBuyer) {
        const { items } = await api.get("/api/cart");
        setCartCount(items.reduce((s, i) => s + Number(i.quantity || 0), 0));
        const { orders } = await api.get("/api/orders/buyer");
        setNotificationsCount(orders.filter((o) => String(o.rawStatus).toLowerCase() === "pending").length);
      } else {
        const { orders } = await api.get("/api/orders/farmer");
        setNotificationsCount(orders.filter((o) => String(o.rawStatus).toLowerCase() === "pending").length);
      }
      const { conversations } = await api.get(`/api/chat/conversations?role=${role}`);
      setMessagesCount(conversations.filter((c) => Number(c.unread || 0) > 0).length || Math.min(conversations.length, 5));
    } catch {
      // badges stay at zero when endpoints fail
    }
  }, [isBuyer, role]);

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
            {isBuyer && (
              <Link to="/buyer/cart" className="d2-hicon">
                <Icon name="cart-outline" size={19} />
                {cartCount > 0 && <span className="d2-hbadge">{cartCount}</span>}
              </Link>
            )}
            <Link to={isBuyer ? "/buyer/favorites" : "/farmer/crops"} className="d2-hicon">
              <Icon name="heart-outline" size={19} />
            </Link>
            <Link to={isBuyer ? "/buyer/orders" : "/farmer/orders"} className="d2-hicon">
              <Icon name="notifications-outline" size={19} />
              {notificationsCount > 0 && <span className="d2-hbadge d2-hbadge-red">{notificationsCount}</span>}
            </Link>
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
