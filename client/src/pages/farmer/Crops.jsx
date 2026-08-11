import { useCallback, useEffect, useState } from "react";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import Modal from "../../components/Modal.jsx";
import { Spinner } from "../../components/Spinner.jsx";
import { ProgressBar } from "../../components/Charts.jsx";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

const EMPTY_FORM = {
  name: "",
  category: "Vegetables",
  growthStage: "Growing",
  plantedDate: "",
  progress: 0,
  health: "Good",
  imageUrl: "",
};

const STAGES = ["Seedling", "Growing", "Vegetative", "Flowering", "Harvest Ready"];
const HEALTH = ["Good", "Fair", "Needs Attention"];

export default function Crops() {
  const [crops, setCrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get("/api/dashboard/crops");
      setCrops(data.crops || []);
    } catch {
      setCrops([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (crop) => {
    setForm({
      name: crop.name || "",
      category: crop.category || "Vegetables",
      growthStage: crop.growth_stage || "Growing",
      plantedDate: crop.planted_date ? crop.planted_date.slice(0, 10) : "",
      progress: Number(crop.progress || 0),
      health: crop.health || "Good",
      imageUrl: crop.image_url || "",
    });
    setEditing(crop);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/api/dashboard/crops/${editing.id}`, form);
      } else {
        await api.post("/api/dashboard/crops", form);
      }
      setEditing(null);
      setForm(EMPTY_FORM);
      setModalOpen(false);
      load();
    } catch {
      alert("Could not save the crop.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await api.del(`/api/dashboard/crops/${deleting.id}`);
      setDeleting(null);
      load();
    } catch {
      alert("Could not delete the crop.");
    }
  };

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  if (loading) {
    return (
      <div className="d2-page d2-loading">
        <Spinner size={22} />
        <span>Loading your crops…</span>
      </div>
    );
  }

  return (
    <div className="d2-page">
      <div className="d2-card d2-page-head">
        <div>
          <h2 className="d2-marketplace-title">Active Crops</h2>
          <p className="d2-marketplace-sub">Track growth stages, health and progress of every crop on your farm.</p>
        </div>
        <button className="d2-btn-primary" onClick={openAdd}>
          <Icon name="add-outline" size={15} /> Add Crop
        </button>
      </div>

      {crops.length ? (
        <div className="d2-crops-page-grid">
          {crops.map((crop) => {
            const healthy = String(crop.health).toLowerCase() !== "fair" && !String(crop.health).toLowerCase().includes("attention");
            return (
              <div className="d2-card d2-crop-page-card" key={crop.id}>
                <div className="d2-crop-page-img">
                  <img src={crop.image_url || FALLBACK_IMAGE} alt={crop.name} />
                  <span className={`d2-health ${healthy ? "good" : "fair"}`}>{crop.health}</span>
                </div>
                <div className="d2-crop-page-body">
                  <div className="d2-crop-top">
                    <span className="d2-crop-name">{crop.name}</span>
                    <span className="d2-crop-cat">{crop.category}</span>
                  </div>
                  <div className="d2-crop-meta">{crop.growth_stage} · Planted {crop.planted_date}</div>
                  <ProgressBar value={crop.progress} color={healthy ? "#16A34A" : "#D97706"} showLabel />
                  <div className="d2-crop-page-actions">
                    <button className="d2-btn-secondary-sm" onClick={() => openEdit(crop)}>
                      <Icon name="create-outline" size={13} /> Edit
                    </button>
                    <button className="d2-btn-danger-sm" onClick={() => setDeleting(crop)}>
                      <Icon name="trash-outline" size={13} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="d2-card empty-state">
          <Icon name="flower-outline" size={34} color="#7A8E81" />
          <h3>No crops tracked yet</h3>
          <p>Add your first crop to monitor growth and harvest readiness.</p>
          <button className="d2-btn-primary mt-2" onClick={openAdd}>Add Crop</button>
        </div>
      )}

      <Modal open={modalOpen} onClose={closeModal} maxWidth={480}>
        <div className="d2-form-modal">
          <h3 className="create-title">{editing ? "Edit Crop" : "Add Crop"}</h3>
          <label className="d2-field">
            <span>Crop name</span>
            <input value={form.name} onChange={set("name")} placeholder="e.g. Tomatoes" />
          </label>
          <div className="d2-form-row">
            <label className="d2-field">
              <span>Category</span>
              <select value={form.category} onChange={set("category")}>
                {["Vegetables", "Grains", "Fruits", "Pulses", "Spices"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="d2-field">
              <span>Growth stage</span>
              <select value={form.growthStage} onChange={set("growthStage")}>
                {STAGES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <div className="d2-form-row">
            <label className="d2-field">
              <span>Planted date</span>
              <input type="date" value={form.plantedDate} onChange={set("plantedDate")} />
            </label>
            <label className="d2-field">
              <span>Health</span>
              <select value={form.health} onChange={set("health")}>
                {HEALTH.map((h) => <option key={h}>{h}</option>)}
              </select>
            </label>
          </div>
          <label className="d2-field">
            <span>Progress ({form.progress}%)</span>
            <input type="range" min="0" max="100" value={form.progress} onChange={set("progress")} />
          </label>
          <label className="d2-field">
            <span>Image URL (optional)</span>
            <input value={form.imageUrl} onChange={set("imageUrl")} placeholder="https://…" />
          </label>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || !form.name.trim()}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Crop"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} maxWidth={420}>
        <div className="card-pad" style={{ border: "none", boxShadow: "none" }}>
          <h3 className="create-title" style={{ fontSize: 18 }}>Delete crop?</h3>
          <p className="create-sub">“{deleting?.name}” will be removed from your farm records.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn btn-danger-soft" onClick={confirmDelete}>Delete</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
