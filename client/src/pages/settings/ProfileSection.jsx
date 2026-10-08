import Icon from "../../Icon.jsx";
import useProfile from "../../hooks/useProfile.js";
import { Spinner } from "../../components/Spinner.jsx";

const initials = (name) =>
  String(name || "U")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const ROLE_LABELS = { buyer: "Buyer", farmer: "Farmer", admin: "Administrator" };

export default function ProfileSection() {
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
      <div className="d2-settings-card d2-settings-center">
        <Spinner size={20} /> <span>Loading profile…</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="d2-settings-card d2-settings-center">
        <Icon name="alert-circle-outline" size={20} /> <span>Could not load your profile.</span>
      </div>
    );
  }

  const displayName = profile.full_name || "User";
  const roleLabel = ROLE_LABELS[String(profile.role).split("_")[0]] || "Member";

  return (
    <div className="d2-settings-section">
      {/* Identity */}
      <div className="d2-settings-card d2-profile-identity">
        <button
          type="button"
          className="d2-profile-avatar-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Change photo"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="d2-hidden-input"
            onChange={(e) => handlePhoto(e.target.files?.[0])}
          />
          {profile.profile_image_url ? (
            <img src={profile.profile_image_url} alt={displayName} />
          ) : (
            <span>{initials(displayName)}</span>
          )}
          <span className="d2-profile-avatar-hint">
            {uploading ? <Spinner light size={16} /> : <Icon name="camera-outline" size={16} />}
          </span>
        </button>
        <div className="d2-profile-identity-copy">
          <div className="d2-profile-identity-name">{displayName}</div>
          <div className="d2-profile-identity-meta">{roleLabel} · {profile.email}</div>
          <div className="d2-profile-identity-hint">Tap the photo to change your profile picture.</div>
        </div>
      </div>

      {/* Personal information */}
      <form className="d2-settings-card d2-settings-form" onSubmit={handleSave}>
        <h2 className="d2-settings-card-title">Personal information</h2>
        <p className="d2-settings-card-sub">Update your account details. Changes are saved to your profile.</p>

        {error && (
          <div className="d2-settings-banner error">
            <Icon name="alert-circle-outline" size={15} /> <span>{error}</span>
          </div>
        )}
        {saved && (
          <div className="d2-settings-banner success">
            <Icon name="checkmark-circle-outline" size={15} /> <span>Profile saved.</span>
          </div>
        )}

        <div className="d2-field">
          <span>Full name</span>
          <input value={form.fullName || ""} onChange={set("fullName")} />
        </div>

        <div className="d2-field">
          <span>Phone number</span>
          <input value={form.phoneNumber || ""} onChange={set("phoneNumber")} />
        </div>

        <div className="d2-form-row">
          <div className="d2-field">
            <span>Location</span>
            <input value={form.location || ""} onChange={set("location")} placeholder="City / region" />
          </div>
          {(String(profile.role).startsWith("farmer") || String(profile.role).startsWith("buyer")) && (
            <div className="d2-field">
              <span>{String(profile.role).startsWith("farmer") ? "Farm / business name" : "Business name"}</span>
              <input value={form.businessName || ""} onChange={set("businessName")} />
            </div>
          )}
        </div>

        <div className="d2-field">
          <span>Biography</span>
          <textarea
            className="d2-textarea"
            value={form.biography || ""}
            onChange={set("biography")}
            placeholder="Tell buyers a little about your farm or business…"
          />
        </div>

        <div className="d2-settings-actions">
          <button type="submit" className="d2-btn-primary" disabled={saving || uploading}>
            {saving ? <Spinner light size={15} /> : <><Icon name="save-outline" size={15} /> Save changes</>}
          </button>
        </div>
      </form>

      {/* Sign out */}
      <div className="d2-settings-card d2-settings-danger-zone">
        <div className="d2-settings-danger-copy">
          <div className="d2-settings-card-title">Sign out</div>
          <p className="d2-settings-card-sub">You can sign back in anytime with your email and password.</p>
        </div>
        <button type="button" className="d2-btn-danger-sm" onClick={handleLogout}>
          <Icon name="log-out-outline" size={15} /> Log out
        </button>
      </div>
    </div>
  );
}
