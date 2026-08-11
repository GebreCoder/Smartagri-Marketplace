import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../Icon.jsx";
import { api } from "../api.js";

const getInitials = (name) => {
  const value = String(name || "").trim();
  if (!value) return "U";
  return value
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
};

export default function DashboardHeader({ role = "farmer" }) {
  const navigate = useNavigate();
  const isBuyer = role === "buyer";
  const ordersRoute = isBuyer ? "/buyer/orders" : "/farmer/orders";
  const quickActionRoute = isBuyer ? "/buyer/cart" : "/farmer/create";
  const quickActionIcon = isBuyer ? "bag-handle-outline" : "add-circle-outline";
  const dashboardLabel = isBuyer ? "Buyer Dashboard" : "Farmer Dashboard";

  const [profile, setProfile] = useState(null);
  const [notificationCount, setNotificationCount] = useState(0);

  const loadProfile = useCallback(async () => {
    try {
      const { user } = await api.get("/api/auth/me");
      setProfile(user);
    } catch {
      setProfile(null);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const { orders } = await api.get(isBuyer ? "/api/orders/buyer" : "/api/orders/farmer");
      const pendingCount = orders.filter((order) => String(order.rawStatus || "").toLowerCase() === "pending").length;
      setNotificationCount(pendingCount);
    } catch {
      setNotificationCount(0);
    }
  }, [isBuyer]);

  useEffect(() => {
    loadProfile();
    loadNotifications();
  }, [loadProfile, loadNotifications]);

  useEffect(() => {
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const displayName = profile?.full_name || (isBuyer ? "Buyer" : "Farmer");
  const initials = getInitials(displayName);

  return (
    <header className={`dash-header ${isBuyer ? "dash-header-buyer" : "dash-header-farmer"}`}>
      <div>
        <div className="dash-greeting">{greeting},</div>
        <div className="dash-name">{displayName}</div>
        <div className="dash-role-pill">{dashboardLabel}</div>
      </div>

      <div className="row" style={{ gap: 10 }}>
        <Link to={ordersRoute} className="dash-icon-btn" aria-label="Open orders">
          <Icon name="receipt-outline" size={20} color="#F5F9F6" />
          {notificationCount > 0 && (
            <span className="dash-badge">{notificationCount > 99 ? "99+" : notificationCount}</span>
          )}
        </Link>

        <Link to={quickActionRoute} className="dash-icon-btn" aria-label={isBuyer ? "Open cart" : "Add product"}>
          <Icon name={quickActionIcon} size={20} color="#F5F9F6" />
        </Link>

        <button className="dash-avatar" onClick={() => navigate("/profile")} aria-label="Open profile">
          {profile?.profile_image_url ? (
            <img src={profile.profile_image_url} alt={displayName} />
          ) : (
            <span>{initials}</span>
          )}
        </button>
      </div>
    </header>
  );
}
