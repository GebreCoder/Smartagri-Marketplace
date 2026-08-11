import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import Modal from "../../components/Modal.jsx";
import { Spinner } from "../../components/Spinner.jsx";

const TYPE_ICON = {
  irrigation: "water-outline",
  fertilization: "leaf-outline",
  "pest control": "bug-outline",
  harvest: "basket-outline",
  planting: "flower-outline",
  delivery: "navigate-outline",
  task: "checkmark-circle-outline",
};

const STATUS_CLASS = { planned: "st-pending", completed: "st-delivered", cancelled: "st-cancelled" };

const EMPTY_FORM = { title: "", activityType: "task", cropName: "", activityDate: "", status: "planned" };

export default function Calendar() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get("/api/dashboard/activities");
      setActivities(data.activities || []);
    } catch {
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map();
    activities.forEach((a) => {
      const date = a.activity_date || "Upcoming";
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(a);
    });
    return [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }, [activities]);

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, activityDate: new Date().toISOString().slice(0, 10) });
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (activity) => {
    setForm({
      title: activity.title || "",
      activityType: activity.activity_type || "task",
      cropName: activity.crop_name || "",
      activityDate: activity.activity_date ? activity.activity_date.slice(0, 10) : "",
      status: activity.status || "planned",
    });
    setEditing(activity);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/api/dashboard/activities/${editing.id}`, form);
      } else {
        await api.post("/api/dashboard/activities", form);
      }
      closeModal();
      load();
    } catch {
      alert("Could not save the activity.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await api.del(`/api/dashboard/activities/${deleting.id}`);
      setDeleting(null);
      load();
    } catch {
      alert("Could not delete the activity.");
    }
  };

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  if (loading) {
    return (
      <div className="d2-page d2-loading">
        <Spinner size={22} />
        <span>Loading your farm calendar…</span>
      </div>
    );
  }

  return (
    <div className="d2-page">
      <div className="d2-card d2-page-head">
        <div>
          <h2 className="d2-marketplace-title">Farm Calendar</h2>
          <p className="d2-marketplace-sub">Plan irrigation, fertilization, pest control, harvests and deliveries.</p>
        </div>
        <button className="d2-btn-primary" onClick={openAdd}>
          <Icon name="add-outline" size={15} /> Create Activity
        </button>
      </div>

      {grouped.length ? (
        <div className="d2-calendar-groups">
          {grouped.map(([date, items]) => (
            <div className="d2-card d2-calendar-group" key={date}>
              <div className="d2-calendar-date-head">
                <Icon name="calendar-outline" size={15} color="#16A34A" /> {date}
                <span className="d2-calendar-count">{items.length} activit{items.length === 1 ? "y" : "ies"}</span>
              </div>
              {items.map((activity) => (
                <div className="d2-cal-row" key={activity.id}>
                  <span className="d2-cal-type-icon">
                    <Icon name={TYPE_ICON[activity.activity_type] || "checkmark-circle-outline"} size={16} />
                  </span>
                  <div className="d2-cal-row-body">
                    <div className="d2-cal-title">{activity.title}{activity.crop_name ? ` — ${activity.crop_name}` : ""}</div>
                    <div className="d2-cal-type">{activity.activity_type} · {activity.activity_date}</div>
                  </div>
                  <span className={`d2-status ${STATUS_CLASS[activity.status] || "st-pending"}`}>{activity.status}</span>
                  <div className="d2-cal-row-actions">
                    <button className="d2-btn-secondary-sm" onClick={() => openEdit(activity)}>
                      <Icon name="create-outline" size={13} />
                    </button>
                    <button className="d2-btn-danger-sm" onClick={() => setDeleting(activity)}>
                      <Icon name="trash-outline" size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="d2-card empty-state">
          <Icon name="calendar-outline" size={34} color="#7A8E81" />
          <h3>No activities planned</h3>
          <p>Add irrigation, fertilization or harvest tasks to your farm calendar.</p>
          <button className="d2-btn-primary mt-2" onClick={openAdd}>Create Activity</button>
        </div>
      )}

      <Modal open={modalOpen} onClose={closeModal} maxWidth={480}>
        <div className="d2-form-modal">
          <h3 className="create-title">{editing ? "Edit Activity" : "Create Activity"}</h3>
          <label className="d2-field">
            <span>Title</span>
            <input value={form.title} onChange={set("title")} placeholder="e.g. Irrigation — Tomatoes" />
          </label>
          <div className="d2-form-row">
            <label className="d2-field">
              <span>Type</span>
              <select value={form.activityType} onChange={set("activityType")}>
                {["irrigation", "fertilization", "pest control", "harvest", "planting", "delivery", "task"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="d2-field">
              <span>Crop (optional)</span>
              <input value={form.cropName} onChange={set("cropName")} placeholder="e.g. Tomatoes" />
            </label>
          </div>
          <div className="d2-form-row">
            <label className="d2-field">
              <span>Date</span>
              <input type="date" value={form.activityDate} onChange={set("activityDate")} />
            </label>
            <label className="d2-field">
              <span>Status</span>
              <select value={form.status} onChange={set("status")}>
                {["planned", "completed", "cancelled"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || !form.title.trim()}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Create"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} maxWidth={420}>
        <div className="card-pad" style={{ border: "none", boxShadow: "none" }}>
          <h3 className="create-title" style={{ fontSize: 18 }}>Delete activity?</h3>
          <p className="create-sub">This activity will be
 removed from your farm calendar.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn btn-danger-soft" onClick={confirmDelete}>Delete</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
