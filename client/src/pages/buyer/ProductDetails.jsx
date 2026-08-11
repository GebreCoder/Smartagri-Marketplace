import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";
import { Spinner, SkeletonCard } from "../../components/Spinner.jsx";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

export default function ProductDetails() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { product: data } = await api.get(`/api/products/${productId}`);
      setProduct(data);
    } catch {
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  const bump = (delta) => setQuantity((q) => Math.max(1, Math.min(Number(product?.quantity || 1), q + delta)));

  const handleAddToCart = async () => {
    setBusy(true);
    try {
      await api.post("/api/cart", { productId, quantity });
      navigate("/buyer/cart");
    } catch (err) {
      alert(err.message || "Could not add to cart.");
    } finally {
      setBusy(false);
    }
  };

  const handleBuyNow = async () => {
    setBusy(true);
    try {
      await api.post("/api/orders", { productId, quantity });
      navigate("/buyer/orders");
    } catch (err) {
      alert(err.message || "Could not place order.");
    } finally {
      setBusy(false);
    }
  };

  const handleMessageFarmer = async () => {
    setBusy(true);
    try {
      const { conversation } = await api.post("/api/chat/direct", { userId: product.farmer_id });
      navigate(`/buyer/chat?conversation=${conversation.id}`);
    } catch (err) {
      alert(err.message || "Could not open the chat.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="pd-grid">
          <SkeletonCard height={420} />
          <SkeletonCard height={420} />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="empty-state">
        <Icon name="alert-circle-outline" size={34} color="#7A8E81" />
        <h3>Product not found</h3>
        <button className="btn btn-soft mt-2" onClick={() => navigate("/buyer")}>Back to marketplace</button>
      </div>
    );
  }

  const initials = String(product.farmer_name || "F")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isOwnProduct = user && String(product.farmer_id) === String(user.id);

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate("/buyer")}>
        <Icon name="arrow-back-outline" size={16} /> Back
      </button>

      <div className="pd-grid mt-2">
        <div className="pd-image-card">
          <img src={product.image_url || FALLBACK_IMAGE} alt={product.name} />
          <div className="pd-image-badges">
            {product.is_organic && <span className="pd-badge">Organic</span>}
            {product.is_bulk && <span className="pd-badge">Bulk</span>}
          </div>
        </div>

        <div className="pd-info">
          <h1>{product.name}</h1>
          <span className="pd-category">{product.category}</span>

          <div className="pd-price">{product.price_label}</div>
          <div className="pd-stock">{product.stock_label}</div>

          <p className="pd-desc">{product.description || "Fresh harvest from a verified farmer."}</p>

          <div className="pd-meta-row">
            <div>
              <div className="pd-meta-label">Location</div>
              <div className="pd-meta-value">{product.location || "Local farm"}</div>
            </div>
            <div>
              <div className="pd-meta-label">Listed</div>
              <div className="pd-meta-value">{product.created_label}</div>
            </div>
          </div>

          {!isOwnProduct && (
            <>
              <div className="row" style={{ gap: 14 }}>
                <div>
                  <div className="pd-meta-label">Quantity</div>
                  <div className="qty-stepper mt-1">
                    <button className="qty-btn" onClick={() => bump(-1)} aria-label="Decrease quantity">−</button>
                    <span className="qty-value">{quantity}</span>
                    <button className="qty-btn" onClick={() => bump(1)} aria-label="Increase quantity">+</button>
                  </div>
                </div>
                <div>
                  <div className="pd-meta-label">Total</div>
                  <div className="pd-price" style={{ fontSize: 20 }}>
                    {product.price_label.replace("ETB", "ETB")} × {quantity} ={" "}
                    {`ETB ${(Number(product.price) * quantity).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                  </div>
                </div>
              </div>

              <div className="pd-actions">
                <button className="btn btn-soft" onClick={handleAddToCart} disabled={busy}>
                  {busy ? <Spinner size={16} /> : <><Icon name="bag-add-outline" size={18} /> Add to cart</>}
                </button>
                <button className="btn btn-primary" onClick={handleBuyNow} disabled={busy}>
                  Buy now
                </button>
              </div>
            </>
          )}

          <div className="pd-farmer">
            <div className="pd-farmer-avatar">
              {product.farmer_image_url ? (
                <img src={product.farmer_image_url} alt={product.farmer_name} />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <div className="pd-farmer-copy">
              <div className="pd-farmer-name">{product.farmer_name}</div>
              <div className="pd-farmer-meta">
                {product.farmer_location || product.location || "Ethiopia"} · Verified farmer
              </div>
            </div>
            {!isOwnProduct && (
              <button className="pd-message-btn" onClick={handleMessageFarmer} disabled={busy}>
                <Icon name="chatbubble-ellipses-outline" size={15} /> Message
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
