import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";
import { getSocket } from "../../socket.js";
import "../dashboards.css";

const tabs = [
  { to: "/buyer", end: true, label: "Home", icon: "home-outline" },
  { to: "/buyer/orders", label: "Orders", icon: "receipt-outline" },
  { to: "/buyer/cart", label: "Cart", icon: "cart-outline" },
  { to: "/buyer/chat", label: "Chat", icon: "chatbubbles-outline" },
  { to: "/profile", label: "Profile", icon: "person-outline" },
];

export default function BuyerLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cartCount, setCartCount] = useState(0);
  const socketRef = useRef(null);

  // Live cart badge
  useEffect(() => {
    const load = async () => {
      try {
        const { items } = await api.get("/api/cart");
        setCartCount(items.reduce((sum, item) => sum + Number(item.quantity || 0), 0));
      } catch {
        setCartCount(0);
      }
    };
    load();

    socketRef.current = getSocket();
    const onOrderChanged = () => load();
    const onMessageNew = () => load();
    socketRef.current.on("order:changed", onOrderChanged);
    socketRef.current.on("message:new", onMessageNew);

    return () => {
      socketRef.current?.off("order:changed", onOrderChanged);
      socketRef.current?.off("message:new", onMessageNew);
    };
  }, []);

  return (
    <div className="dash-shell">
      <div className="dash-body">
        <Outlet context={{ cartCount, setCartCount }} />
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
              {tab.label === "Cart" && cartCount > 0 && <span className="dash-tab-badge">{cartCount > 99 ? "99+" : cartCount}</span>}
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
