import { useState } from "react";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";
import { Spinner } from "../../components/Spinner.jsx";

export default function SecuritySection() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      await api.post("/api/users/me/password", { currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message || "Could not update your password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="d2-settings-section">
      {/* Account identity */}
      <div className="d2-settings-card">
        <h2 className="d2-settings-card-title">Account</h2>
        <p className="d2-settings-card-sub">Your sign-in identity for SmartAgri.</p>
        <div className="d2-settings-account-row">
          <span className="d2-settings-account-icon">
            <Icon name="mail-outline" size={17} />
          </span>
          <div>
            <div className="d2-settings-account-label">Email address</div>
            <div className="d2-settings-account-value">{user?.email || "—"}</div>
          </div>
        </div>
      </div>

      {/* Change password */}
      <form className="d2-settings-card d2-settings-form" onSubmit={handleSubmit}>
        <h2 className="d2-settings-card-title">Change password</h2>
        <p className="d2-settings-card-sub">
          Use at least 6 characters. Choose a password you don&apos;t use anywhere else.
        </p>

        {error && (
          <div className="d2-settings-banner error">
            <Icon name="alert-circle-outline" size={15} /> <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="d2-settings-banner success">
            <Icon name="checkmark-circle-outline" size={15} /> <span>Password updated.</span>
          </div>
        )}

        <div className="d2-field">
          <span>Current password</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => { setCurrentPassword(e.target.value); setSuccess(false); }}
            autoComplete="current-password"
          />
        </div>

        <div className="d2-form-row">
          <div className="d2-field">
            <span>New password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setSuccess(false); }}
              autoComplete="new-password"
            />
          </div>
          <div className="d2-field">
            <span>Confirm new password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setSuccess(false); }}
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="d2-settings-actions">
          <button type="submit" className="d2-btn-primary" disabled={saving}>
            {saving ? <Spinner light size={15} /> : <><Icon name="shield-checkmark-outline" size={15} /> Update password</>}
          </button>
        </div>
      </form>
    </div>
  );
}
