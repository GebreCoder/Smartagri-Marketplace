import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import { getSocket } from "../../socket.js";
import { Spinner, SkeletonCard } from "../../components/Spinner.jsx";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

const CATEGORIES = ["All", "Vegetables", "Fruits", "Grains", "Pulses", "Spices"];

export default function Marketplace() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get("category") || "All";
  const initialSearch = searchParams.get("search") || "";

  const [products, setProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState(initialSearch);
  const [appliedSearch, setAppliedSearch] = useState(initialSearch);
  const [category, setCategory] = useState(initialCategory);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const offsetRef = useRef(0);
  const LIMIT = 12;

  const fetchProducts = useCallback(
    async (offset, append = false) => {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
      if (appliedSearch) params.set("search", appliedSearch);
      if (category !== "All") params.set("category", category);
      try {
        const data = await api.get(`/api/products?${params.toString()}`);
        setProducts((prev) => (append ? [...prev, ...data.products] : data.products));
        setTotalCount(data.totalCount || 0);
      } catch {
        /* noop */
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [appliedSearch, category]
  );

  useEffect(() => {
    setLoading(true);
    offsetRef.current = 0;
    fetchProducts(0, false);
  }, [fetchProducts]);

  // Live marketplace: refresh when a farmer publishes/edits/removes a
  // product, and whenever the socket (re)connects so nothing is missed.
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => {
      offsetRef.current = 0;
      fetchProducts(0, false);
    };
    socket.on("product:changed", refresh);
    socket.on("connect", refresh);
    return () => {
      socket.off("product:changed", refresh);
      socket.off("connect", refresh);
    };
  }, [fetchProducts]);

  const handleSearch = () => setAppliedSearch(search.trim());
  const handleLoadMore = () => {
    offsetRef.current += LIMIT;
    setLoadingMore(true);
    fetchProducts(offsetRef.current, true);
  };

  return (
    <div className="d2-page">
      <div className="d2-card d2-marketplace-hero">
        <div>
          <h2 className="d2-marketplace-title">Marketplace</h2>
          <p className="d2-marketplace-sub">Browse fresh produce listed directly by trusted Ethiopian farmers.</p>
        </div>
        <div className="d2-marketplace-search">
          <Icon name="search-outline" size={17} color="#64748B" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleSearch()}
            placeholder="Search products, farmers, categories…"
          />
          <button className="d2-btn-primary-sm" onClick={handleSearch}>Search</button>
        </div>
      </div>

      <div className="d2-cat-tabs">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`d2-cat-tab${category === cat ? " active" : ""}`}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="d2-marketplace-count">
        {loading ? "Loading listings…" : `${totalCount} live listing${totalCount === 1 ? "" : "s"}${appliedSearch ? ` for “${appliedSearch}”` : ""}`}
      </div>

      <div className="d2-products-grid">
        {loading
          ? Array.from({ length: 8 }).map((_, index) => <SkeletonCard key={index} />)
          : products.map((product) => (
              <div className="d2-product-card" key={product.id} onClick={() => navigate(`/buyer/product-details/${product.id}`)}>
                <div className="d2-product-img-wrap">
                  <img src={product.image_url || FALLBACK_IMAGE} alt={product.name} loading="lazy" />
                  {product.is_organic && <span className="d2-badge-fresh">Organic</span>}
                </div>
                <div className="d2-product-body">
                  <div className="d2-product-name">{product.name}</div>
                  <div className="d2-product-farm">
                    <Icon name="location-outline" size={12} /> {product.farmer_name || "Farmer"} · {product.location || product.farmer_location || "Addis Ababa"}
                  </div>
                  <div className="d2-product-meta">
                    <span className="d2-in-stock">{Number(product.quantity) > 0 ? "In Stock" : "Out of Stock"}</span>
                    <span className="d2-product-cat">{product.category}</span>
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

      {!loading && !products.length && (
        <div className="d2-card empty-state">
          <Icon name="search-outline" size={34} color="#7A8E81" />
          <h3>No products found</h3>
          <p>Try a different search term or category.</p>
        </div>
      )}

      {!loading && products.length < totalCount && (
        <div className="d2-load-more-wrap">
          <button className="d2-btn-secondary" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? <Spinner size={16} /> : `Load more (${products.length} of ${totalCount})`}
          </button>
        </div>
      )}
    </div>
  );
}
