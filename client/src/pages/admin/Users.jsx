import { useCallback, useEffect, useState } from "react";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import Modal from "../../components/Modal.jsx";
import { Spinner } from "../../components/Spinner.jsx";

const initials = (name) =>
  String(name || "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [preview, setPreview] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { users: data } = await api.get("/api/admin/users");
      setUsers(data);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleState = async (user) => {
    const nextState = user.accountState === "active" ? "inactive" : "active";
    setBusyId(user.id);
    try {
      await api.patch(`/api/admin/users/${user.id}/state`, { nextState });
      await load();
    } catch (err) {
      alert(err.message || "Could not update the user.");
    } finally {
      setBusyId(null);
    }
  };

  const openDelete = async (user) => {
    setDeleteTarget(user);
    setPreview(null);
    try {
      const data = await api.get(`/api/admin/users/${user.id}/deletion-preview`);
      setPreview(data);
    } catch (err) {
      setPreview({ error: err.message });
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api.del(`/api/admin/users/${deleteTarget.id}`);
      setDeleteTarget(null);
      setPreview(null);
      await load();
    } catch (err) {
      alert(err.message || "Could not delete the user.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 18px", fontSize: 22, fontWeight: 900, color: "var(--green-950)" }}>Users</h2>

      {loading ? (
        <div className="card card-pad"><Spinner size={18} /> <span className="muted small bold">Loading users…</span></div>
      ) : (
        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Type</th>
                <th>Location</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="admin-cell-user">
                      <div className="admin-cell-avatar">
                        {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} /> : <span>{initials(user.name)}</span>}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="admin-cell-name">{user.name}</div>
                        <div className="admin-cell-sub">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`admin-chip admin-chip-${user.userType}`}>{user.userType}</span>
                    {user.businessName && <div className="admin-cell-sub" style={{ marginTop: 2 }}>{user.businessName}</div>}
                  </td>
                  <td className="muted">{user.location || "—"}</td>
                  <td>
                    <span className={`admin-chip admin-chip-${user.accountState}`}>{user.statusLabel}</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                      {user.userType !== "admin" && (
                        <button
                          className="btn btn-sm btn-soft"
                          onClick={() => toggleState(user)}
                          disabled={busyId === user.id}
                        >
                          {busyId === user.id ? <Spinner size={13} /> : user.accountState === "active" ? "Deactivate" : "Activate"}
                        </button>
                      )}
                      <button className="btn btn-sm btn-danger-soft" onClick={() => openDelete(user)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!deleteTarget} onClose={() => { setDeleteTarget(null); setPreview(null); }} maxWidth={480}>
        <div className="card-pad" style={{ border: "none", boxShadow: "none" }}>
          <h3 className="create-title" style={{ fontSize: 18 }}>Delete {deleteTarget?.name}?</h3>

          {!preview ? (
            <div className="row mt-2"><Spinner size={16} /> <span className="muted small bold">Checking related data…</span></div>
          ) : preview.error ? (
            <p className="state-copy">{preview.error}</p>
          ) : (
            <>
              {preview.hasRelatedData ? (
                <>
                  <p className="state-copy">
                    This {preview.userType} account has related data:
                  </p>
                  <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", margin: "12px 0" }}>
                    <div className="stat-card" style={{ padding: 12 }}>
                      <div className="stat-value" style={{ fontSize: 20 }}>{preview.relatedProducts}</div>
                      <div className="stat-label">Products</div>
                    </div>
                    <div className="stat-card" style={{ padding: 12 }}>
                      <div className="stat-value" style={{ fontSize: 20 }}>{preview.relatedOrders}</div>
                      <div className="stat-label">Orders</div>
                    </div>
                    <div className="stat-card" style={{ padding: 12 }}>
                      <div className="stat-value" style={{ fontSize: 20 }}>{preview.relatedMessages}</div>
                      <div className="stat-label">Messages</div>
                    </div>
                  </div>
                  <div className="error-banner">
                    <Icon name="alert-circle-outline" size={16} />
                    <span>Deleting will remove all related products, orders, and messages. We recommend deactivating instead.</span>
                  </div>
                  <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                    <button className="btn btn-ghost" onClick={() => { setDeleteTarget(null); setPreview(null); }}>Cancel</button>
                    <button className="btn btn-soft" onClick={() => toggleState(deleteTarget)} disabled={deleting}>
                      Deactivate instead
                    </button>
                    <button className="btn btn-danger-soft" onClick={confirmDelete} disabled={deleting}>
                      {deleting ? <Spinner size={14} /> : "Delete anyway"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="state-copy">No related data found. This account can be safely deleted.</p>
                  <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                    <button className="btn btn-ghost" onClick={() => { setDeleteTarget(null); setPreview(null); }}>Cancel</button>
                    <button className="btn btn-danger-soft" onClick={confirmDelete} disabled={deleting}>
                      {deleting ? <Spinner size={14} /> : "Delete user"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
