import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import DashboardHeader from "../../components/DashboardHeader.jsx";
import MarketplaceBanner from "../../components/MarketplaceBanner.jsx";
import CategoryTabs from "../../components/CategoryTabs.jsx";
import SearchBar from "../../components/SearchBar.jsx";
import ProductCard from "../../components/ProductCard.jsx";
import { SkeletonCard } from "../../components/Spinner.jsx";
import { getSocket } from "../../socket.js";

const CATEGORIES = ["All", "Vegetables", "Fruits", "Grains", "Pulses", "Spices"];

export default function BuyerHome() {
  const navigate = useNavigate();
  const [sections, setSections] = useState({});
  const [products, setProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState(null);
  const offsetRef = useRef(0);

  const LIMIT = 12;

  const loadFeatured = useCallback(async () => {
    try {
      const data = await api.get("/api/products/featured");
      setSections({
        newest: data.newest || [],
        bulk: data.bulk || [],
        organic: data.organic || [],
      });
    } catch {
      setSections({});
    }
  }, []);

  const fetchProducts = useCallback(
    async (offset, append = false) => {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
      if (appliedSearch) params.set("search", appliedSearch);
      if (category !== "All") params.set("category", category);

      try {
        const data = await api.get(`/api/products?${params.toString()}`);
        setProducts((prev) => (append ? [...prev, ...data.products] : data.products));
        setTotalCount(data.totalCount || 0);
      } finally {
        setLoading(false);
      }
    },
    [appliedSearch, category]
  );

  useEffect(() => {
    loadFeatured();
  }, [loadFeatured]);

  useEffect(() => {
    setLoading(true);
    offsetRef.current = 0;
    fetchProducts(0, false);
  }, [fetchProducts]);

  // Live updates when the admin removes a product
  useEffect(() => {
    const socket = getSocket();
    const onProductChanged = () => {
      offsetRef.current = 0;
      fetchProducts(0, false);
    };
    socket.on("product:changed", onProductChanged);
    return () => socket.off("product:changed", onProductChanged);
  }, [fetchProducts]);

  const handleSearch = () => setAppliedSearch(search.trim());

  const handleLoadMore = () => {
    offsetRef.current += LIMIT;
    fetchProducts(offsetRef.current, true);
  };

  const handleAddToCart = async (product) => {
    setAddingId(product.id);
    try {
      await api.post("/api/cart", { productId: product.id, quantity: 1 });
      // small feedback: navigate to cart
      navigate("/buyer/cart");
    } catch (err) {
      alert(err.message || "Could not add to cart.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div>
      <DashboardHeader role="buyer" />

      <MarketplaceBanner sections={sections} onPressProduct={(product) => navigate(`/buyer/product-details/${product.id}`)} />

      <div className="buyer-heading">
        <h2>Marketplace</h2>
        <span className="section-hint">
          {loading ? "Loading…" : `${totalCount} live listing${totalCount === 1 ? "" : "s"}`}
        </span>
      </div>

      <SearchBar value={search} onChange={setSearch} onSubmit={handleSearch} />

      <div className="mt-2">
        <CategoryTabs categories={CATEGORIES} value={category} onChange={setCategory} />
      </div>

      <div className="product-grid mt-3">
        {loading
          ? Array.from({ length: 6 }).map((_, index) => <SkeletonCard key={index} />)
          : products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onPress={() => navigate(`/buyer/product-details/${product.id}`)}
                onAddToCart={() => handleAddToCart(product)}
              />
            ))}
      </div>

      {!loading && !products.length && (
        <div className="empty-state">
          <Icon name="search-outline" size={34} color="#7A8E81" />
          <h3>No products found</h3>
          <p>Try a different search term or category.</p>
        </div>
      )}

      {!loading && products.length < totalCount && (
        <div className="text-center mt-3">
          <button className="btn btn-soft" onClick={handleLoadMore}>
            Load more ({products.length} of {totalCount})
          </button>
        </div>
      )}

      {addingId && <span className="hidden" />}
    </div>
  );
}
