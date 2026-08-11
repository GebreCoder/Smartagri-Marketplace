import Icon from "../Icon.jsx";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

export default function ProductCard({ product, onPress, onAddToCart }) {
  if (!product) return null;

  const badges = [product.is_organic ? "Organic" : null, product.is_bulk ? "Bulk" : null].filter(Boolean);

  return (
    <article className="product-card" onClick={onPress}>
      <div className="product-image-wrap">
        <img src={product.image_url || FALLBACK_IMAGE} alt={product.name} loading="lazy" />
        <div className="product-badges">
          {badges.map((badge) => (
            <span key={badge} className="product-badge">
              {badge}
            </span>
          ))}
        </div>
      </div>

      <div className="product-body">
        <h3 className="product-name">{product.name}</h3>
        <p className="product-desc">{product.description || "Fresh harvest from a verified farmer."}</p>

        <div className="row" style={{ marginTop: 10 }}>
          <Icon name="location-outline" size={13} color="#8F9B97" />
          <span className="product-meta">{product.location || product.farmer_location || "Local farm"}</span>
        </div>

        <div className="between row" style={{ marginTop: 12 }}>
          <span className="product-price">{product.price_label}</span>
          <span className="product-stock">{product.stock_label}</span>
        </div>

        <div className="between row" style={{ marginTop: 14 }}>
          <div>
            <div className="product-farmer-label">Farmer</div>
            <div className="product-farmer-name">{product.farmer_name}</div>
          </div>
          <button
            className="product-cart-btn"
            aria-label={`Add ${product.name} to cart`}
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart?.();
            }}
          >
            <Icon name="bag-add-outline" size={16} color="#222" />
          </button>
        </div>
      </div>
    </article>
  );
}
