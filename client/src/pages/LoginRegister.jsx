import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../Icon.jsx";
import { useAuth } from "../auth.jsx";
import { Spinner } from "../components/Spinner.jsx";

const ROLES = [
  { value: "buyer", label: "Buyer", icon: "cart-outline", desc: "Browse & order fresh produce" },
  { value: "farmer", label: "Farmer", icon: "leaf-outline", desc: "Sell directly to buyers" },
];

export default function LoginRegister() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, register, homeByRole } = useAuth();

  const initialMode = searchParams.get("mode") === "register" ? "register" : "login";
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState("buyer");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    fullName: "",
    phoneNumber: "",
    email: "",
    businessName: "",
    location: "",
    password: "",
  });

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const switchMode = (next) => {
    setMode(next);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const user =
        mode === "register"
          ? await register({ ...form, role })
          : await login({ email: form.email, password: form.password });
      navigate(homeByRole(user.role), { replace: true });
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = mode === "login" ? form.email && form.password : form.fullName && form.email && form.password;

  return (
    <div className="auth-page">
      {/* Brand panel */}
      <aside className="auth-brand">
        <div className="auth-brand-inner">
          <div className="row" style={{ gap: 12 }}>
            <div className="land-logo-shell" style={{ background: "rgba(255,255,255,0.14)" }}>
              <img src="/images/logo-1.png" alt="AgriSpark logo" />
            </div>
            <div>
              <div className="land-logo-text" style={{ color: "#fff" }}>AgriSpark</div>
              <div className="land-brand-sub" style={{ color: "rgba(255,255,255,0.75)" }}>Secure . Verified</div>
            </div>
          </div>

          <div className="auth-brand-quote">
            <h1>From farm to buyer — without the middleman.</h1>
            <p>Join Ethiopia's trusted agricultural marketplace. List produce, browse listings, chat in real time, and grow together.</p>
          </div>

          <div className="auth-brand-points">
            <div className="row" style={{ gap: 10 }}>
              <Icon name="shield-checkmark-outline" size={18} color="#A7F0C4" />
              <span>Verified farmers & buyers</span>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <Icon name="chatbubble-ellipses-outline" size={18} color="#A7F0C4" />
              <span>Direct order-to-chat communication</span>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <Icon name="stats-chart-outline" size={18} color="#A7F0C4" />
              <span>Live market prices in 4 languages</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <main className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-tabs">
            <button
              className={`auth-tab${mode === "login" ? " auth-tab-active" : ""}`}
              onClick={() => switchMode("login")}
            >
              Login
            </button>
            <button
              className={`auth-tab${mode === "register" ? " auth-tab-active" : ""}`}
              onClick={() => switchMode("register")}
            >
              Register
            </button>
          </div>

          <h2 className="auth-title">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <p className="auth-sub">
            {mode === "login"
              ? "Log in to manage orders, listings, and chats."
              : "Sign up in under a minute — it's free."}
          </p>

          {error && (
            <div className="error-banner">
              <Icon name="alert-circle-outline" size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {mode === "register" && (
              <>
                <div className="auth-roles">
                  {ROLES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`auth-role${role === option.value ? " auth-role-active" : ""}`}
                      onClick={() => setRole(option.value)}
                    >
                      <Icon name={option.icon} size={20} />
                      <span className="auth-role-label">{option.label}</span>
                      <span className="auth-role-desc">{option.desc}</span>
                    </button>
                  ))}
                </div>

                <div className="field">
                  <label>Full name</label>
                  <input className="input" value={form.fullName} onChange={set("fullName")} placeholder="e.g. Abebe Tesfaye" autoComplete="name" />
                </div>

                <div className="field">
                  <label>Phone number</label>
                  <input className="input" value={form.phoneNumber} onChange={set("phoneNumber")} placeholder="+251 9XX XXX XXX" autoComplete="tel" />
                </div>

                {role === "farmer" && (
                  <div className="auth-grid">
                    <div className="field">
                      <label>Farm / business name</label>
                      <input className="input" value={form.businessName} onChange={set("businessName")} placeholder="Green Valley Farms" />
                    </div>
                    <div className="field">
                      <label>Location</label>
                      <input className="input" value={form.location} onChange={set("location")} placeholder="Addis Ababa" />
                    </div>
                  </div>
                )}

                {role === "buyer" && (
                  <div className="field">
                    <label>Location</label>
                    <input className="input" value={form.location} onChange={set("location")} placeholder="City / region" />
                  </div>
                )}
              </>
            )}

            <div className="field">
              <label>Email address</label>
              <input className="input" type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" autoComplete="email" />
            </div>

            <div className="field">
              <label>Password</label>
              <div className="password-wrap">
                <input
                  className="input"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={set("password")}
                  placeholder={mode === "register" ? "At least 6 characters" : "Your password"}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} aria-label="Toggle password visibility">
                  <Icon name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} />
                </button>
              </div>
            </div>

            {mode === "login" && (
              <div className="between row" style={{ marginBottom: 14 }}>
                <span />
                <Link to="/reset-password" className="auth-link">Forgot password?</Link>
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={!canSubmit || loading}>
              {loading ? <Spinner light size={18} /> : mode === "login" ? "Log in" : "Create account"}
            </button>
          </form>

          <div className="auth-foot">
            {mode === "login" ? (
              <span>
                Don't have an account?{" "}
                <button className="auth-link-inline" onClick={() => switchMode("register")}>Register</button>
              </span>
            ) : (
              <span>
                Already have an account?{" "}
                <button className="auth-link-inline" onClick={() => switchMode("login")}>Log in</button>
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
