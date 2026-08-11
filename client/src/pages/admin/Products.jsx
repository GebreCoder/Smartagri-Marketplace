import { useCallback, useEffect, useState } from "react";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import Modal from "../../components/Modal.jsx";
import { Spinner } from "../../components/Spinner.jsx";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { products: data } = await api.get("/api/admin/products");
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
    setDeleting(true);
    try {
      await api.del(`/api/admin/products/${deleteTarget.id}`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      alert(err.message || "Could not delete the product.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 18px", fontSize: 22, fontWeight: 900, color: "var(--green-950)" }}>Products</h2>

      {loading ? (
        <div className="card card-pad"><Spinner size={18} /> <span className="muted small bold">Loading products…</span></div>
      ) : (
        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Farmer</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Listed</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div className="admin-cell-user">
                      <div className="admin-thumb">
                        <img src={product.imageUrl || FALLBACK_IMAGE} alt={product.name} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="admin-cell-name">{product.name}</div>
                        <div className="admin-cell-sub">{product.location}</div>
                      </div>
                    </div>
                  </td>
                  <td>{product.farmerName}</td>
                  <td>
                    <span className="admin-chip admin-chip-farmer">{product.category}</span>
                  </td>
                  <td className="bold">{product.priceLabel}</td>
                  <td className="muted">{product.stockLabel}</td>
                  <td className="muted">{product.createdLabel}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-sm btn-danger-soft" onClick={() => setDeleteTarget(product)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth={420}>
        <div className="card-pad" style={{ border: "none", boxShadow: "none" }}>
          <h3 className="create-title" style={{ fontSize: 18 }}>Remove product?</h3>
          <p className="create-sub">“{deleteTarget?.name}” will be removed from the marketplace.</p>
          <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
            <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="btn btn-danger-soft" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Spinner size={14} /> : "Remove"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
