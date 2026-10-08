import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import { ThemeProvider } from "./theme.jsx";

import Landing from "./pages/Landing.jsx";
import LoginRegister from "./pages/LoginRegister.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import NewPassword from "./pages/NewPassword.jsx";
import PublicProducts from "./pages/PublicProducts.jsx";
import Profile from "./pages/Profile.jsx";
import ChatPage from "./pages/ChatPage.jsx";

import BuyerLayout from "./pages/buyer/BuyerLayout.jsx";
import BuyerHome from "./pages/buyer/Home.jsx";
import BuyerMarketplace from "./pages/buyer/Marketplace.jsx";
import BuyerFavorites from "./pages/buyer/Favorites.jsx";
import BuyerProductDetails from "./pages/buyer/ProductDetails.jsx";
import BuyerCart from "./pages/buyer/Cart.jsx";
import BuyerOrders from "./pages/buyer/Orders.jsx";
import Messenger from "./pages/Messenger.jsx";

import FarmerLayout from "./pages/farmer/FarmerLayout.jsx";
import FarmerHome from "./pages/farmer/Home.jsx";
import FarmerProducts from "./pages/farmer/Products.jsx";
import FarmerCreate from "./pages/farmer/Create.jsx";
import FarmerOrders from "./pages/farmer/Orders.jsx";

import FarmerCrops from "./pages/farmer/Crops.jsx";
import FarmerCalendar from "./pages/farmer/Calendar.jsx";
import FarmerAnalytics from "./pages/farmer/Analytics.jsx";

import MarketPrices from "./pages/MarketPrices.jsx";

import SettingsLayout from "./pages/settings/SettingsLayout.jsx";
import ProfileSection from "./pages/settings/ProfileSection.jsx";
import SecuritySection from "./pages/settings/SecuritySection.jsx";
import PreferencesSection from "./pages/settings/PreferencesSection.jsx";

import AdminLayout from "./pages/admin/AdminLayout.jsx";
import AdminDashboard from "./pages/admin/Dashboard.jsx";
import AdminUsers from "./pages/admin/Users.jsx";
import AdminProducts from "./pages/admin/Products.jsx";
import AdminOrders from "./pages/admin/Orders.jsx";
import AdminSettlements from "./pages/admin/Settlements.jsx";
import AdminChat from "./pages/admin/Chat.jsx";
import AdminReports from "./pages/admin/Reports.jsx";

import { Spinner } from "./components/Spinner.jsx";

const baseRole = (role = "") => String(role).split("_")[0];

/** Gate a dashboard behind login + a specific base role. */
function RequireRole({ role, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="page-center">
        <Spinner />
      </div>
    );
  }

  if (!user) return <Navigate to="/login-register?mode=login" replace />;
  if (role && baseRole(user.role) !== role) return <Navigate to="/" replace />;
  return children;
}

/** Any logged-in user may visit these shared pages. */
function RequireLogin({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="page-center">
        <Spinner />
      </div>
    );
  }
  if (!user) return <Navigate to="/login-register?mode=login" replace />;
  return children;
}

/**
 * The legacy /profile route stays functional: admins keep the standalone
 * profile page, buyers/farmers land on the new Settings → My Profile.
 */
function RoleProfile() {
  const { user } = useAuth();
  const role = baseRole(user?.role);
  if (role === "admin") return <Profile />;
  return <Navigate to={`/${role}/settings/profile`} replace />;
}

export default function App() {
  return (
    <ThemeProvider>
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/products" element={<PublicProducts />} />
      <Route path="/login-register" element={<LoginRegister />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/new-password" element={<NewPassword />} />

      {/* Buyer */}      <Route
        path="/buyer"
        element={
          <RequireRole role="buyer">
            <BuyerLayout />
          </RequireRole>
        }
      >
        <Route index element={<BuyerHome />} />
        <Route path="marketplace" element={<BuyerMarketplace />} />
        <Route path="favorites" element={<BuyerFavorites />} />
        <Route path="market-prices" element={<MarketPrices />} />
        <Route path="product-details/:productId" element={<BuyerProductDetails />} />
        <Route path="cart" element={<BuyerCart />} />
        <Route path="orders" element={<BuyerOrders />} />
        <Route path="chat" element={<Messenger />} />
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="profile" replace />} />
          <Route path="profile" element={<ProfileSection />} />
          <Route path="security" element={<SecuritySection />} />
          <Route path="preferences" element={<PreferencesSection />} />
        </Route>
      </Route>

      {/* Farmer */}
      <Route
        path="/farmer"
        element={
          <RequireRole role="farmer">
            <FarmerLayout />
          </RequireRole>
        }
      >
        <Route index element={<FarmerHome />} />
        <Route path="products" element={<FarmerProducts />} />
        <Route path="create" element={<FarmerCreate />} />
        <Route path="orders" element={<FarmerOrders />} />
        <Route path="chat" element={<Messenger />} />
        <Route path="crops" element={<FarmerCrops />} />
        <Route path="calendar" element={<FarmerCalendar />} />
        <Route path="analytics" element={<FarmerAnalytics />} />
        <Route path="market-prices" element={<MarketPrices />} />
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="profile" replace />} />
          <Route path="profile" element={<ProfileSection />} />
          <Route path="security" element={<SecuritySection />} />
          <Route path="preferences" element={<PreferencesSection />} />
        </Route>
      </Route>

      {/* Admin */}
      <Route
        path="/admin"
        element={
          <RequireRole role="admin">
            <AdminLayout />
          </RequireRole>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="settlements" element={<AdminSettlements />} />
        <Route path="chat" element={<AdminChat />} />
        <Route path="reports" element={<AdminReports />} />
      </Route>

      {/* Shared dashboards (any logged-in role) */}
      <Route
        path="/profile"
        element={
          <RequireLogin>
            <RoleProfile />
          </RequireLogin>
        }
      />
      <Route
        path="/chat/:orderId"
        element={
          <RequireLogin>
            <ChatPage />
          </RequireLogin>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ThemeProvider>
  );
}
