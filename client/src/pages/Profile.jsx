import { useNavigate } from "react-router-dom";
import Icon from "../Icon.jsx";
import useProfile from "../hooks/useProfile.js";
import { Spinner } from "../components/Spinner.jsx";
import "./chatpage.css";

const initials = (name) =>
  String(name || "U")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const ROLE_LABELS = { buyer: "Buyer", farmer: "Farmer", admin: "Administrator" };

export default function Profile() {
  const navigate = useNavigate();
  const {
    profile,
    form,
    loading,
    saving,
    uploading,
    saved,
    error,
    fileInputRef,
    set,
    handleSave,
    handlePhoto,
    handleLogout,
  } = useProfile();

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-head" />
        <div className="profile-body">
          <div className="profile-card">
            <div className="row"><Spinner size={18} /> <span className="muted small bold">Loading profile…</span></div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-center">
        <div className="state-card">
          <h3 className="state-title">Not signed in</h3>
          <button className="btn btn-primary mt-2" onClick={() => navigate("/login-register?mode=login")}>Log in</button>
        </div>
      </div>
    );
  }

  const displayName = profile.full_name || "User";
  const roleLabel = ROLE_LABELS[String(profile.role).split("_")[0]] || "Member";

  return (
    <div className="profile-page">
      <div className="profile-head">
        <button className="chatpage-back" style={{ position: "absolute", left: 16, top: 16 }} onClick={() => navigate("/")} aria-label="Home">
          <Icon name="home-outline" size={18} color="#fff" />
        </button>

        <div className="profile-avatar-lg" onClick={() => fileInputRef.current?.click()} title="Change photo">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handlePhoto(e.target.files?.[0])}
          />
          {profile.profile_image_url ? (
            <img src={profile.profile_image_url} alt={displayName} />
          ) : (
            <span>{initials(displayName)}</span>
          )}
          <span className="profile-avatar-hint">
            {uploading ? <Spinner light size={20} /> : <Icon name="camera-outline" size={20} />}
          </span>
        </div>

        <div className="profile-name-lg">{displayName}</div>
        <div className="profile-role-lg">{roleLabel} · {profile.email}</div>
      </div>

      <div className="profile-body">
        <form className="profile-card" onSubmit={handleSave}>
          <h3 className="profile-section-title">Personal information</h3>

          {error && (
            <div className="error-banner">
              <Icon name="alert-circle-outline" size={16} />
              <span>{error}</span>
            </div>
          )}

          {saved && (
            <div className="error-banner" style={{ background: "#d8f7e5", borderColor: "#b6e9c9", color: "#0d6b2e" }}>
              <Icon name="checkmark-circle-outline" size={16} />
              <span>Profile saved.</span>
            </div>
          )}

          <div className="field">
            <label>Full name</label>
            <input className="input" value={form.fullName || ""} onChange={set("fullName")} />
          </div>

          <div className="field">
            <label>Phone number</label>
            <input className="input" value={form.phoneNumber || ""} onChange={set("phoneNumber")} />
          </div>

          <div className="auth-grid">
            <div className="field">
              <label>Location</label>
              <input className="input" value={form.location || ""} onChange={set("location")} placeholder="City / region" />
            </div>
            {(String(profile.role).startsWith("farmer") || String(profile.role).startsWith("buyer")) && (
              <div className="field">
                <label>{String(profile.role).startsWith("farmer") ? "Farm / business name" : "Business name"}</label>
                <input className="input" value={form.businessName || ""} onChange={set("businessName")} />
              </div>
            )}
          </div>

          <div className="field">
            <label>Biography</label>
            <textarea
              className="textarea"
              value={form.biography || ""}
              onChange={set("biography")}
              placeholder="Tell buyers a little about your farm or business…"
            />
          </div>

          <div className="profile-save-row">
            <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
              {saving ? <Spinner light size={16} /> : <><Icon name="save-outline" size={16} /> Save changes</>}
            </button>
          </div>
        </form>

        <button className="btn btn-danger-soft profile-logout" onClick={handleLogout}>
          <Icon name="log-out-outline" size={16} /> Log out
        </button>
      </div>
    </div>
  );
}
