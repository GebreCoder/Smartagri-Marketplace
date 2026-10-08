import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import { Spinner } from "../../components/Spinner.jsx";
import CheckoutModal from "../../components/CheckoutModal.jsx";

// Flat delivery fee charged when the cart has items (matches the original app).
const DELIVERY_FEE = 180;

export default function Cart() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  // Checkout sheet state
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  const load = useCallback(async () => {
    try {
      const { items: data } = await api.get("/api/cart");
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changeQuantity = async (item, quantity) => {
    const safe = Math.max(1, Number(quantity || 1));
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, quantity: safe, subtotal: it.price * safe } : it)));
    try {
      await api.patch(`/api/cart/${item.id}`, { quantity: safe });
    } catch (err) {
      alert(err.message || "Could not update quantity.");
      load();
    }
  };

  const removeItem = async (itemId) => {
    setItems((prev) => prev.filter((it) => it.id !== itemId));
    try {
      await api.del(`/api/cart/${itemId}`);
    } catch {
      load();
    }
  };

  const clearCart = async () => {
    setItems([]);
    try {
      await api.del("/api/cart");
    } catch {
      load();
    }
  };

  const placeOrder = () => {
    setError("");
    setCheckoutError("");
    setCheckoutOpen(true);
  };

  const submitCheckout = async ({ deliveryMethod, deliveryAddress, deliveryNotes }) => {
    setPlacing(true);
    setCheckoutError("");
    try {
      const { orders } = await api.post("/api/orders/from-cart", { deliveryMethod, deliveryAddress, deliveryNotes });
      setCheckoutOpen(false);
      if (orders?.length) {
        navigate("/buyer/orders", { replace: true });
      }
    } catch (err) {
      setCheckoutError(err.message || "Could not place the order.");
    } finally {
      setPlacing(false);
    }
  };

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0), [items]);
  const delivery = items.length ? DELIVERY_FEE : 0;
  const total = subtotal + delivery;

  return (
    <div>
      <div className="buyer-heading">
        <h2>Your Cart</h2>
        <span className="section-hint">{items.length} item{items.length === 1 ? "" : "s"}</span>
      </div>

      {error && (
        <div className="error-banner">
          <Icon name="alert-circle-outline" size={16} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="card card-pad"><Spinner size={18} /> <span className="muted small bold">Loading cart…</span></div>
      ) : !items.length ? (
        <div className="empty-state">
          <Icon name="cart-outline" size={38} color="#7A8E81" />
          <h3>Your cart is empty</h3>
          <p>Browse the marketplace and add products to get started.</p>
          <button className="btn btn-primary mt-2" onClick={() => navigate("/buyer")}>Browse products</button>
        </div>
      ) : (
        <>
          <div className="cart-list">
            {items.map((item) => (
              <div key={item.id} className="cart-item">
                <div className="cart-thumb">
                  <img src={item.product?.image_url || "https://images.unsplash.com/photo-1464226184884-fa280b87c399"} alt={item.product_name} />
                </div>

                <div className="cart-info">
                  <div className="cart-name">{item.product_name}</div>
                  <div className="cart-farmer">{item.farmer_name} · {item.location}</div>
                  <div className="row mt-1" style={{ gap: 12 }}>
                    <div className="qty-stepper" style={{ borderRadius: 10 }}>
                      <button className="qty-btn" style={{ width: 34, height: 32 }} onClick={() => changeQuantity(item, item.quantity - 1)} aria-label="Decrease">−</button>
                      <span className="qty-value" style={{ minWidth: 38, fontSize: 13 }}>{item.quantity}</span>
                      <button className="qty-btn" style={{ width: 34, height: 32 }} onClick={() => changeQuantity(item, item.quantity + 1)} aria-label="Increase">+</button>
                    </div>
                    <div className="cart-price">{item.subtotal_label}</div>
                  </div>
                </div>

                <button className="cart-remove" onClick={() => removeItem(item.id)} aria-label="Remove item">
                  <Icon name="trash-outline" size={18} />
                </button>
              </div>
            ))}
          </div>

          <div className="cart-summary">
            <div className="cart-summary-row">
              <span>Subtotal</span>
              <span>{`ETB ${subtotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</span>
            </div>
            <div className="cart-summary-row">
              <span>Delivery</span>
              <span>{`ETB ${delivery.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</span>
            </div>
            <div className="cart-summary-row" style={{ fontSize: 11, color: "var(--muted-2)" }}>
              <span>Flat fee for home delivery — farm pickup is free (choose at checkout)</span>
              <span />
            </div>
            <div className="cart-summary-total">
              <span>Total</span>
              <span className="cart-total-value">{`ETB ${total.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</span>
            </div>

            <div className="row mt-3" style={{ gap: 10 }}>
              <button className="btn btn-primary grow" onClick={placeOrder} disabled={placing || !items.length}>
                {placing ? <Spinner light size={18} /> : "Place order"}
              </button>
              <button className="btn btn-ghost" onClick={clearCart}>Clear</button>
            </div>
          </div>

          <CheckoutModal
            open={checkoutOpen}
            onClose={() => { setCheckoutOpen(false); setCheckoutError(""); }}
            subtotal={subtotal}
            itemCount={items.length}
            confirmLabel="Place order"
            busy={placing}
            error={checkoutError}
            onSubmit={submitCheckout}
          />
        </>
      )}
    </div>
  );
}
