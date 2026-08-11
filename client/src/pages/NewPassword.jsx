import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../Icon.jsx";
import { api } from "../api.js";
import { Spinner } from "../components/Spinner.jsx";

export default function NewPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialToken = searchParams.get("token") || "";

  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/api/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <main className="auth-form-panel" style={{ flex: 1 }}>
        <div className="auth-card" style={{ maxWidth: 440 }}>
          <div className="row" style={{ gap: 10, marginBottom: 18 }}>
            <Link to="/login-register?mode=login" className="auth-back" aria-label="Back to login">
              <Icon name="arrow-back-outline" size={18} />
            </Link>
            <div>
              <div className="land-logo-text" style={{ fontSize: 18 }}>AgriSpark</div>
              <div className="land-brand-sub">Set a new password</div>
            </div>
          </div>

          {done ? (
            <div className="reset-success">
              <div className="reset-success-icon">
                <Icon name="checkmark-circle-outline" size={26} color="#1E7A35" />
              </div>
              <h3>Password updated!</h3>
              <p>Your password has been reset. Log in with your new password to continue.</p>
              <Link to="/login-register?mode=login" className="btn btn-primary btn-block">Log in</Link>
            </div>
          ) : (
            <>
              <h2 className="auth-title">Create a new password</h2>
              <p className="auth-sub">Enter the reset token you received and choose a new password.</p>

              {error && (
                <div className="error-banner">
                  <Icon name="alert-circle-outline" size={16} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className="field">
                  <label>Reset token</label>
                  <input className="input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste your reset token" required />
                </div>

                <div className="field">
                  <label>New password</label>
                  <div className="password-wrap">
                    <input
                      className="input"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 4 characters"
                      autoComplete="new-password"
                    />
                    <button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} aria-label="Toggle password visibility">
                      <Icon name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} />
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label>Confirm new password</label>
                  <input className="input" type={showPassword ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat your new password" autoComplete="new-password" />
                </div>

                <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={!token || !password || !confirm || loading}>
                  {loading ? <Spinner light size={18} /> : "Update password"}
                </button>
              </form>
            </>
          )}

          <div className="auth-foot">
            <Link to="/login-register?mode=login" className="auth-link">Back to login</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
