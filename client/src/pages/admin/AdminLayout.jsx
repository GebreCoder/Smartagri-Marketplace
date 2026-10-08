import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";
import { getSocket } from "../../socket.js";
import "../admin.css";

const navItems = [
  { to: "/admin", end: true, label: "Dashboard", icon: "grid-outline" },
  { to: "/admin/users", label: "Users", icon: "people-outline" },
  { to: "/admin/products", label: "Products", icon: "cube-outline" },
  { to: "/admin/orders", label: "Orders", icon: "receipt-outline" },
  { to: "/admin/settlements", label: "Settlements", icon: "wallet-outline" },
  { to: "/admin/chat", label: "Chat", icon: "chatbubbles-outline" },
  { to: "/admin/reports", label: "Reports", icon: "flag-outline" },
];

const initials = (name) =>
  String(name || "A")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function AdminLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const [{ profile: profileData }, { notificationCount: count }] = await Promise.all([
          api.get("/api/admin/profile"),
          api.get("/api/admin/stats"),
        ]);
        setProfile(profileData);
        setNotificationCount(count || 0);
      } catch {
        /* ignore */
      }
    };
    load();

    const socket = getSocket();
    const onChange = () => load();
    socket.on("order:changed", onChange);
    socket.on("message:new", onChange);

    const interval = setInterval(load, 30000);

    return () => {
      socket.off("order:changed", onChange);
      socket.off("message:new", onChange);
      clearInterval(interval);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const displayName = profile?.full_name || user?.full_name || "Admin";
  const userInitials = initials(displayName);

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-icon">
            <Icon name="wheat" size={20} color="#166534" />
          </span>
          <div>
            <div className="admin-brand-name">SmartAgri-Marketplace</div>
            <div className="admin-brand-role">Admin Panel</div>
          </div>
        </div>

        <nav className="admin-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `admin-nav-link${isActive ? " admin-nav-link-active" : ""}`}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {item.label === "Reports" && notificationCount > 0 && (
                <span className="admin-nav-badge">{notificationCount > 99 ? "99+" : notificationCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-foot">
          <div className="admin-side-user">
            <div className="admin-side-avatar">
              {profile?.profile_image_url ? <img src={profile.profile_image_url} alt={displayName} /> : <span>{userInitials}</span>}
            </div>
            <div className="admin-side-name">{displayName}</div>
          </div>
          <button className="admin-side-logout" onClick={handleLogout}>
            <Icon name="log-out-outline" size={16} /> Log out
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <div className="admin-topbar">
          <div>
            <div className="admin-topbar-title">Administration</div>
            <div className="admin-topbar-sub">Monitor users, products, orders, and disputes</div>
          </div>
          {notificationCount > 0 && (
            <span className="pill pill-flag">
              <Icon name="notifications-outline" size={14} /> {notificationCount} pending
            </span>
          )}
        </div>
        <div className="admin-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
