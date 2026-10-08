import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../../Icon.jsx";
import { api, uploadImage } from "../../api.js";
import { Spinner } from "../../components/Spinner.jsx";

const CATEGORIES = ["Vegetables", "Fruits", "Grains", "Pulses", "Spices"];

const emptyForm = {
  name: "",
  category: "Vegetables",
  description: "",
  price: "",
  quantity: "",
  location: "",
  imageUrl: "",
};

export default function Create() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");

  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(Boolean(editId));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const loadProduct = useCallback(async () => {
    if (!editId) return;
    setLoading(true);
    try {
      const { product } = await api.get(`/api/products/${editId}`);
      if (product && String(product.farmer_id) === String(localStorage.getItem("smartagri_user_id") || "")) {
        // ownership is enforced server-side too; prefill regardless of local id
      }
      setForm({
        name: product?.name || "",
        category: product?.category || "Vegetables",
        description: product?.description || "",
        price: product?.price ?? "",
        quantity: product?.quantity ?? "",
        location: product?.location || "",
        imageUrl: product?.image_url || "",
      });
    } catch (err) {
      setError(err.message || "Could not load product.");
    } finally {
      setLoading(false);
    }
  }, [editId]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const data = await uploadImage(file);
      setForm((prev) => ({ ...prev, imageUrl: data.url }));
    } catch (err) {
      setError(err.message || "Image upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        category: form.category,
        description: form.description,
        price: Number(form.price),
        quantity: Number(form.quantity),
        location: form.location,
        imageUrl: form.imageUrl,
      };

      if (editId) {
        await api.put(`/api/products/${editId}`, payload);
      } else {
        await api.post("/api/products", payload);
      }
      navigate("/farmer/products");
    } catch (err) {
      setError(err.message || "Could not save the product.");
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = form.name && form.price && form.quantity && form.location && form.description;

  if (loading) {
    return (
      <div className="create-card">
        <div className="row"><Spinner size={18} /> <span className="muted small bold">Loading product…</span></div>
      </div>
    );
  }

  return (
    <div className="create-card">
      <button className="btn btn-ghost btn-sm mb-2" onClick={() => navigate("/farmer/products")}>
        <Icon name="arrow-back-outline" size={15} /> Back to products
      </button>

      <h1 className="create-title">{editId ? "Edit product" : "List a new product"}</h1>
      <p className="create-sub">Add accurate details so buyers can find and trust your harvest.</p>

      {error && (
        <div className="error-banner">
          <Icon name="alert-circle-outline" size={16} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label>Product name</label>
          <input className="input" value={form.name} onChange={set("name")} placeholder="e.g. Organic Tomatoes" />
        </div>

        <div className="field">
          <label>Category</label>
          <select className="select" value={form.category} onChange={set("category")}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Description</label>
          <textarea className="textarea" value={form.description} onChange={set("description")} placeholder="Quality, harvest date, delivery notes…" />
        </div>

        <div className="auth-grid">
          <div className="field">
            <label>Price (ETB / kg)</label>
            <input className="input" type="number" min="0" value={form.price} onChange={set("price")} placeholder="60" />
          </div>
          <div className="field">
            <label>Quantity (kg)</label>
            <input className="input" type="number" min="0" value={form.quantity} onChange={set("quantity")} placeholder="500" />
          </div>
        </div>

        <div className="field">
          <label>Location</label>
          <input className="input" value={form.location} onChange={set("location")} placeholder="e.g. Addis Ababa" />
        </div>

        <div className="field">
          <label>Product photo</label>
          <div
            className={`upload-drop${dragging ? " upload-dragging" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {uploading ? (
              <div className="row" style={{ justifyContent: "center" }}>
                <Spinner size={18} /> <span className="muted small bold">Uploading…</span>
              </div>
            ) : (
              <>
                <Icon name="cloud-upload-outline" size={28} color="#1E7A35" />
                <div className="muted small bold mt-1">Click or drag an image here</div>
              </>
            )}
          </div>

          {form.imageUrl && (
            <div className="upload-preview">
              <img src={form.imageUrl} alt="Product preview" />
              <button type="button" className="upload-remove" onClick={() => setForm((prev) => ({ ...prev, imageUrl: "" }))} aria-label="Remove image">
                <Icon name="close-outline" size={16} />
              </button>
            </div>
          )}
        </div>

        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={!canSubmit || saving || uploading}>
          {saving ? <Spinner light size={18} /> : editId ? "Save changes" : "Publish product"}
        </button>
      </form>
    </div>
  );
}
