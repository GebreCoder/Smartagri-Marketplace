import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";
import { getSocket } from "../../socket.js";
import "../dashboards.css";

const tabs = [
  { to: "/farmer", end: true, label: "Home", icon: "home-outline" },
  { to: "/farmer/products", label: "Products", icon: "cube-outline" },
  { to: "/farmer/create", label: "Add", icon: "add-circle-outline" },
  { to: "/farmer/orders", label: "Orders", icon: "receipt-outline" },
  { to: "/farmer/chat", label: "Chat", icon: "chatbubbles-outline" },
];

export default function FarmerLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const { orders } = await api.get("/api/orders/farmer");
        setPendingCount(orders.filter((o) => o.rawStatus === "pending").length);
      } catch {
        setPendingCount(0);
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

  return (
    <div className="dash-shell">
      <div className="dash-body">
        <Outlet />
      </div>

      <nav className="dash-tabbar">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `dash-tab${isActive ? " dash-tab-active" : ""}`}
          >
            <span style={{ position: "relative" }}>
              <Icon name={tab.icon} size={20} />
              {tab.label === "Orders" && pendingCount > 0 && (
                <span className="dash-tab-badge">{pendingCount > 99 ? "99+" : pendingCount}</span>
              )}
            </span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      {!user && (() => {
        navigate("/login-register?mode=login", { replace: true });
        return null;
      })()}
    </div>
  );
}
