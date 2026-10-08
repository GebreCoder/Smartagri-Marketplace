import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import Icon from "../Icon.jsx";
import { api, setToken } from "../api.js";
import { useAuth } from "../auth.jsx";
import { disconnectSocket, getSocket } from "../socket.js";
import Modal from "./Modal.jsx";
import ChatFab from "./ChatFab.jsx";
import AiChatbot from "./AiChatbot.jsx";
import { useTheme } from "../theme.jsx";

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
    { type: "settings", label: "Settings", icon: "settings-outline" },
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
    { type: "settings", label: "Settings", icon: "settings-outline" },
  ]},
];

const SETTINGS_SUBNAV = [
  { to: "profile", label: "My Profile", icon: "person-outline" },
  { to: "security", label: "Security", icon: "shield-checkmark-outline" },
  { to: "preferences", label: "Preferences", icon: "options-outline" },
];

export default function DashboardShell({ role = "farmer" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isBuyer = role === "buyer";
  const nav = isBuyer ? BUYER_NAV : FARMER_NAV;
  const searchPlaceholder = isBuyer ? "Search products, farmers, categories..." : "Search anything...";

  const [profile, setProfile] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [messagesCount, setMessagesCount] = useState(0);
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [priceAlerts, setPriceAlerts] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const notifRef = useRef(null);
  // Theme is managed centrally (Settings → Preferences) via ThemeProvider.
  useTheme();

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
      let alertCount = 0;
      if (isBuyer) {
        const { items } = await api.get("/api/cart");
        setCartCount(items.reduce((s, i) => s + Number(i.quantity || 0), 0));
        // Price-drop alerts on favorited products feed the same bell.
        try {
          const { priceAlerts: alerts } = await api.get("/api/dashboard/buyer/insights");
          setPriceAlerts(alerts || []);
          alertCount = (alerts || []).length;
        } catch {
          /* bell still shows other notifications */
        }
      }
      // Persistent in-app notifications (order / payment / system events).
      try {
        const { notifications: notifs, unread } = await api.get("/api/notifications");
        setNotifications(notifs || []);
        setNotificationsCount((notifs || []).length ? unread : alertCount);
      } catch {
        setNotifications([]);
        setNotificationsCount(alertCount);
      }
      const { conversations } = await api.get("/api/chat/direct");
      const unreadCount = conversations.filter((c) => Number(c.unread || 0) > 0).length;
      setMessagesCount(unreadCount);
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
    const onNotification = () => {
      setNotificationsCount((count) => count + 1);
      loadBadges();
    };
    socket.on("order:changed", onChange);
    socket.on("message:new", onChange);
    socket.on("product:changed", onChange);
    socket.on("notification:new", onNotification);
    return () => {
      socket.off("order:changed", onChange);
      socket.off("message:new", onChange);
      socket.off("product:changed", onChange);
      socket.off("notification:new", onNotification);
    };
  }, [loadBadges]);

  // Clear the unread badge as soon as the Messenger marks messages as read,
  // so the count reflects what the user has actually seen.
  useEffect(() => {
    const onChatRead = () => loadBadges();
    window.addEventListener("smartagri:chat-read", onChatRead);
    return () => window.removeEventListener("smartagri:chat-read", onChatRead);
  }, [loadBadges]);

  // Keep the sidebar/header name in sync after profile edits in Settings.
  useEffect(() => {
    const onProfileUpdated = () => loadProfile();
    window.addEventListener("smartagri:profile-updated", onProfileUpdated);
    return () => window.removeEventListener("smartagri:profile-updated", onProfileUpdated);
  }, [loadProfile]);

  const settingsBase = `/${isBuyer ? "buyer" : "farmer"}/settings`;
  const inSettings = location.pathname.startsWith(settingsBase);
  const [settingsOpen, setSettingsOpen] = useState(inSettings);
  useEffect(() => {
    // Keep the submenu expanded while the user navigates between sections.
    if (inSettings) setSettingsOpen(true);
  }, [inSettings]);

  // Human label for the current dashboard page (feeds the AI assistant context).
  const dashboardPage = (() => {
    const path = location.pathname.replace(/^\/[^/]+/, "");
    const labels = {
      "/": isBuyer ? "Buyer Dashboard" : "Farmer Dashboard",
      "/marketplace": "Marketplace",
      "/favorites": "Favorites",
      "/cart": "Cart",
      "/orders": "Orders",
      "/products": "My Products",
      "/create": "Add Product",
      "/analytics": "Analytics",
      "/crops": "Crops",
      "/calendar": "Farm Calendar",
      "/market-prices": "Market Prices",
      "/chat": "Messages",
    };
    return labels[path] || (isBuyer ? "Buyer Dashboard" : "Farmer Dashboard");
  })();

  const openNotification = async (notification) => {
    setNotifOpen(false);
    if (!notification.isRead) {
      try {
        await api.patch(`/api/notifications/${notification.id}/read`);
        setNotifications((list) => list.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)));
        setNotificationsCount((count) => Math.max(0, count - 1));
      } catch {
        /* ignore */
      }
    }
    if (notification.link) navigate(notification.link);
  };

  const markAllNotificationsRead = async () => {
    try {
      await api.post("/api/notifications/read-all");
      setNotifications((list) => list.map((n) => ({ ...n, isRead: true })));
      setNotificationsCount(0);
    } catch {
      /* ignore */
    }
  };

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
    // Tear down the socket so the next login starts with a fresh connection.
    disconnectSocket();
    navigate("/login-register?mode=login");
  };

  return (
    <div className="d2-app">
      <aside className="d2-sidebar">
        <Link to={isBuyer ? "/buyer" : "/farmer"} className="d2-brand">
          <span className="d2-brand-logo">
            <Icon name="wheat" size={18} color="#fff" />
          </span>
          <span className="d2-brand-name">SmartAgri-Marketplace</span>
        </Link>

        <nav className="d2-nav">
          {nav.map((group) => (
            <div className="d2-nav-group" key={group.section}>
              <div className="d2-nav-label">{group.section}</div>
              {group.items.map((item) => {
                if (item.type === "settings") {
                  return (
                    <div className="d2-nav-settings" key={item.label}>
                      <button
                        type="button"
                        className={`d2-nav-item d2-nav-toggle${inSettings ? " d2-nav-active" : ""}`}
                        onClick={() => setSettingsOpen((v) => !v)}
                        aria-expanded={settingsOpen}
                        aria-controls="d2-settings-submenu"
                      >
                        <Icon name={item.icon} size={16} />
                        <span className="d2-nav-text">{item.label}</span>
                        <span className={`d2-nav-chevron${settingsOpen ? " open" : ""}`}>
                          <Icon name="chevron-down" size={14} />
                        </span>
                      </button>
                      <div id="d2-settings-submenu" className={`d2-nav-sub${settingsOpen ? " open" : ""}`}>
                        <div className="d2-nav-sub-inner">
                          {SETTINGS_SUBNAV.map((sub) => (
                            <NavLink
                              key={sub.to}
                              to={`${settingsBase}/${sub.to}`}
                              className={({ isActive }) => `d2-nav-sub-item${isActive ? " active" : ""}`}
                            >
                              <Icon name={sub.icon} size={14} />
                              <span className="d2-nav-text">{sub.label}</span>
                            </NavLink>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                }
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
                  <div className="d2-notif-head">
                    <div className="d2-notif-title">Notifications</div>
                    {notifications.some((n) => !n.isRead) && (
                      <button className="d2-notif-markall" onClick={markAllNotificationsRead}>
                        Mark all read
                      </button>
                    )}
                  </div>

                  {notifications.length > 0 && (
                    <>
                      <div className="d2-notif-group">Updates</div>
                      {notifications.slice(0, 8).map((notification) => (
                        <button
                          className={`d2-notif-item${notification.isRead ? " d2-notif-read" : ""}`}
                          key={notification.id}
                          onClick={() => openNotification(notification)}
                        >
                          <span className="d2-notif-icon">
                            <Icon
                              name={notification.type === "payment" ? "card-outline" : notification.type === "message" ? "chatbubbles-outline" : "notifications-outline"}
                              size={16}
                            />
                          </span>
                          <div className="d2-notif-body">
                            <div className="d2-notif-text">{notification.title}</div>
                            <div className="d2-notif-sub">{notification.body}</div>
                          </div>
                          {!notification.isRead && <span className="d2-notif-dot" />}
                        </button>
                      ))}
                    </>
                  )}

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

                  <button className="d2-notif-item d2-notif-link" onClick={() => { setNotifOpen(false); navigate(isBuyer ? "/buyer/orders" : "/farmer/orders"); }}>
                    <Icon name="receipt-outline" size={16} />
                    <div className="d2-notif-body">
                      <div className="d2-notif-text">View your orders</div>
                      <div className="d2-notif-sub">Track status, confirm delivery, report issues</div>
                    </div>
                  </button>

                  {notifications.length === 0 && priceAlerts.length === 0 && (
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
                  <button onClick={() => { setMenuOpen(false); navigate(`${settingsBase}/profile`); }}>
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

      <ChatFab onClick={() => setChatOpen(true)} label={isBuyer ? "Ask AI" : "Ask AI"} />

      <Modal open={chatOpen} onClose={() => setChatOpen(false)} maxWidth={460}>
        <div style={{ height: "80vh", minHeight: 520 }}>
          <AiChatbot
            onClose={() => setChatOpen(false)}
            dashboardRole={isBuyer ? "buyer" : "farmer"}
            dashboardPage={dashboardPage}
          />
        </div>
      </Modal>
    </div>
  );
}
