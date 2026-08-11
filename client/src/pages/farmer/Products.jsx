import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import Modal from "../../components/Modal.jsx";
import { Spinner } from "../../components/Spinner.jsx";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

export default function FarmerProducts() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try {
      const { products: data } = await api.get("/api/products/mine/all");
      setProducts(data);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDelete = async () => {
    try {
      await api.del(`/api/products/${deleting.id}`);
      setDeleting(null);
      load();
    } catch (err) {
      alert(err.message || "Could not delete the product.");
    }
  };

  return (
    <div>
      <div className="buyer-heading">
        <h2>My Products</h2>
        <button className="btn btn-primary btn-sm" onClick={() => navigate("/farmer/create")}>
          <Icon name="add-outline" size={16} /> Add product
        </button>
      </div>

      {loading ? (
        <div className="card card-pad"><Spinner size={18} /> <span className="muted small bold">Loading products…</span></div>
      ) : !products.length ? (
        <div className="empty-state">
          <Icon name="cube-outline" size={38} color="#7A8E81" />
          <h3>No products listed</h3>
          <p>Add your first product to start selling to buyers.</p>
          <button className="btn btn-primary mt-2" onClick={() => navigate("/farmer/create")}>List a product</button>
        </div>
      ) : (
        products.map((product) => (
          <div key={product.id} className="fp-row">
            <div className="fp-thumb">
              <img src={product.image_url || FALLBACK_IMAGE} alt={product.name} />
            </div>
            <div className="fp-info">
              <div className="fp-name">{product.name}</div>
              <div className="fp-meta">
                {product.category} · {product.price_label} · {product.stock_label}
              </div>
              <div className="fp-meta">{product.location}</div>
            </div>
            <div className="fp-actions">
              <button className="fp-btn" onClick={() => navigate(`/farmer/create?edit=${product.id}`)} aria-label={`Edit ${product.name}`}>
                <Icon name="create-outline" size={17} />
              </button>
              <button className="fp-btn fp-btn-danger" onClick={() => setDeleting(product)} aria-label={`Delete ${product.name}`}>
                <Icon name="trash-outline" size={17} />
              </button>
            </div>
          </div>
        ))
      )}

      <Modal open={!!deleting} onClose={() => setDeleting(null)} maxWidth={420}>
        <div className="card-pad" style={{ border: "none", boxShadow: "none" }}>
          <h3 className="create-title" style={{ fontSize: 18 }}>Delete product?</h3>
          <p className="create-sub">
            “{deleting?.name}” will be removed from the marketplace. This cannot be undone.
          </p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn btn-danger-soft" onClick={confirmDelete}>Delete</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
