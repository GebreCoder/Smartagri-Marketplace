import { useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../Icon.jsx";
import { api } from "../api.js";
import { Spinner } from "../components/Spinner.jsx";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.post("/api/auth/forgot-password", { email });
      setToken(data.token || "");
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
              <div className="land-brand-sub">Password recovery</div>
            </div>
          </div>

          <h2 className="auth-title">Reset your password</h2>
          <p className="auth-sub">Enter the email linked to your account and we'll generate a reset token for you.</p>

          {error && (
            <div className="error-banner">
              <Icon name="alert-circle-outline" size={16} />
              <span>{error}</span>
            </div>
          )}

          {token ? (
            <div className="reset-success">
              <div className="reset-success-icon">
                <Icon name="mail-unread-outline" size={26} color="#1E7A35" />
              </div>
              <h3>Check your email</h3>
              <p>A reset token was generated for <strong>{email}</strong>.</p>
              <p className="small muted">(No email provider is configured, so your token is shown below — copy it and continue.)</p>
              <div className="reset-token-box">{token}</div>
              <Link to={`/new-password?token=${encodeURIComponent(token)}`} className="btn btn-primary btn-block">
                Continue to new password
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className="field">
                <label>Email address</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
              </div>
              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={!email || loading}>
                {loading ? <Spinner light size={18} /> : "Send reset token"}
              </button>
            </form>
          )}

          <div className="auth-foot">
            <Link to="/login-register?mode=login" className="auth-link">Back to login</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
