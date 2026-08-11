import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth.jsx";

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
import BuyerChatList from "./pages/buyer/ChatList.jsx";

import FarmerLayout from "./pages/farmer/FarmerLayout.jsx";
import FarmerHome from "./pages/farmer/Home.jsx";
import FarmerProducts from "./pages/farmer/Products.jsx";
import FarmerCreate from "./pages/farmer/Create.jsx";
import FarmerOrders from "./pages/farmer/Orders.jsx";
import FarmerChatbox from "./pages/farmer/Chatbox.jsx";
import FarmerCrops from "./pages/farmer/Crops.jsx";
import FarmerCalendar from "./pages/farmer/Calendar.jsx";

import MarketPrices from "./pages/MarketPrices.jsx";

import AdminLayout from "./pages/admin/AdminLayout.jsx";
import AdminDashboard from "./pages/admin/Dashboard.jsx";
import AdminUsers from "./pages/admin/Users.jsx";
import AdminProducts from "./pages/admin/Products.jsx";
import AdminOrders from "./pages/admin/Orders.jsx";
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

export default function App() {
  return (
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
        <Route path="chat" element={<BuyerChatList />} />
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
        <Route path="chat" element={<FarmerChatbox />} />
        <Route path="crops" element={<FarmerCrops />} />
        <Route path="calendar" element={<FarmerCalendar />} />
        <Route path="market-prices" element={<MarketPrices />} />
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
        <Route path="chat" element={<AdminChat />} />
        <Route path="reports" element={<AdminReports />} />
      </Route>

      {/* Shared dashboards (any logged-in role) */}
      <Route
        path="/profile"
        element={
          <RequireLogin>
            <Profile />
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
  );
}
