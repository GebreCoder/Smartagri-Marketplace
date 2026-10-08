import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../Icon.jsx";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import CategoryTabs from "../components/CategoryTabs.jsx";
import SearchBar from "../components/SearchBar.jsx";
import ProductCard from "../components/ProductCard.jsx";
import { SkeletonCard } from "../components/Spinner.jsx";
import "./landing.css";

const CATEGORIES = ["All", "Vegetables", "Fruits", "Grains", "Pulses", "Spices"];

export default function PublicProducts() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [products, setProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [category, setCategory] = useState("All");
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

  const handleSearch = () => {
    setAppliedSearch(search.trim());
  };

  const handleLoadMore = () => {
    offsetRef.current += LIMIT;
    setLoadingMore(true);
    fetchProducts(offsetRef.current, true);
  };

  const openProduct = (product) => {
    if (user?.role === "buyer") {
      navigate(`/buyer/product-details/${product.id}`);
    } else if (user) {
      navigate("/buyer");
    } else {
      navigate("/login-register?mode=login");
    }
  };

  const addToCartFlow = () => {
    if (user?.role === "buyer") {
      navigate("/buyer");
    } else {
      navigate("/login-register?mode=login");
    }
  };

  return (
    <div className="pub-products-page">
      <header className="pub-header">
        <div className="land-header-inner">
          <div className="land-brand" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
            <div className="land-logo-shell">
              <Icon name="wheat" size={24} color="#166534" />
            </div>
            <div>
              <div className="land-logo-text">SmartAgri-Marketplace</div>
              <div className="land-brand-sub">Secure . Verified</div>
            </div>
          </div>

          <nav className="land-nav">
            <Link to="/" className="btn btn-ghost btn-sm">Home</Link>
            {user ? (
              <Link to={user.role === "admin" ? "/admin" : user.role === "farmer" ? "/farmer" : "/buyer"} className="btn btn-primary btn-sm">
                Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login-register?mode=login" className="btn btn-ghost btn-sm">Login</Link>
                <Link to="/login-register?mode=register" className="btn btn-primary btn-sm">Register</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="pub-main">
        <div className="pub-hero">
          <h1>Explore the Marketplace</h1>
          <p>Browse fresh produce listed directly by Ethiopian farmers.</p>
          <SearchBar value={search} onChange={setSearch} onSubmit={handleSearch} placeholder="Search products, categories, locations…" />
        </div>

        <CategoryTabs categories={CATEGORIES} value={category} onChange={setCategory} />

        <div className="pub-count">
          {loading ? "Loading listings…" : `${totalCount} live listing${totalCount === 1 ? "" : "s"}${appliedSearch ? ` for “${appliedSearch}”` : ""}`}
        </div>

        <div className="product-grid">
          {loading
            ? Array.from({ length: 6 }).map((_, index) => <SkeletonCard key={index} />)
            : products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onPress={() => openProduct(product)}
                  onAddToCart={addToCartFlow}
                />
              ))}
        </div>

        {!loading && !products.length && (
          <div className="pub-empty">
            <Icon name="search-outline" size={34} color="#7A8E81" />
            <h3>No products found</h3>
            <p>Try a different search term or category.</p>
          </div>
        )}

        {!loading && products.length < totalCount && (
          <div className="text-center mt-3">
            <button className="btn btn-soft" onClick={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : `Load more (${products.length} of ${totalCount})`}
            </button>
          </div>
        )}
      </main>

      <footer className="pub-footer">
        <span>© 2026 SmartAgri — Ethiopia's Agricultural Marketplace</span>
      </footer>
    </div>
  );
}
