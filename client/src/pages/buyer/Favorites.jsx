import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import { Spinner } from "../../components/Spinner.jsx";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

export default function Favorites() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.get("/api/dashboard/favorites");
      setProducts(data.products || []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (productId) => {
    const product = products.find((p) => p.id === productId);
    if (!product?.fav_id) return;
    try {
      await api.del(`/api/dashboard/favorites/${product.fav_id}`);
      load();
    } catch {
      load();
    }
  };

  if (loading) {
    return (
      <div className="d2-page d2-loading">
        <Spinner size={22} />
        <span>Loading your favorites…</span>
      </div>
    );
  }

  return (
    <div className="d2-page">
      <div className="d2-card d2-page-head">
        <div>
          <h2 className="d2-marketplace-title">Saved Products</h2>
          <p className="d2-marketplace-sub">Products you've saved for later — tap to view details.</p>
        </div>
      </div>

      {products.length ? (
        <div className="d2-products-grid">
          {products.map((product) => (
            <div className="d2-product-card" key={product.id} onClick={() => navigate(`/buyer/product-details/${product.id}`)}>
              <div className="d2-product-img-wrap">
                <img src={product.image_url || FALLBACK_IMAGE} alt={product.name} loading="lazy" />
                <button
                  className="d2-fav-btn active"
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(product.id);
                  }}
                  aria-label="Remove from favorites"
                >
                  <Icon name="heart" size={17} color="#E11D48" />
                </button>
              </div>
              <div className="d2-product-body">
                <div className="d2-product-name">{product.name}</div>
                <div className="d2-product-farm">
                  <Icon name="location-outline" size={12} /> {product.farmer_name || "Farmer"}
                </div>
                <div className="d2-product-meta">
                  <span className="d2-product-cat">{product.category}</span>
                  <span className={`d2-in-stock${product.in_stock ? "" : " out"}`}>{product.in_stock ? "In Stock" : "Out of Stock"}</span>
                </div>
                <div className="d2-product-foot">
                  <span className="d2-product-price">{product.price_label}</span>
                  <button className="d2-btn-primary-sm" onClick={(event) => {
                    event.stopPropagation();
                    navigate(`/buyer/product-details/${product.id}`);
                  }}>
                    <Icon name="cart-outline" size={13} /> View
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="d2-card empty-state">
          <Icon name="heart-outline" size={34} color="#7A8E81" />
          <h3>No saved products yet</h3>
          <p>Tap the heart on any product to save it here.</p>
          <button className="d2-btn-primary mt-2" onClick={() => navigate("/buyer/marketplace")}>Browse Marketplace</button>
        </div>
      )}
    </div>
  );
}
