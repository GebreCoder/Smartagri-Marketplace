import { NavLink, Outlet, useLocation } from "react-router-dom";
import Icon from "../../Icon.jsx";

const SECTIONS = [
  { to: "profile", label: "My Profile", icon: "person-outline", hint: "Account details & personal information" },
  { to: "security", label: "Security", icon: "shield-checkmark-outline", hint: "Password & account security" },
  { to: "preferences", label: "Preferences", icon: "options-outline", hint: "Theme & app appearance" },
];

export default function SettingsLayout() {
  const location = useLocation();
  // e.g. "/buyer/settings" — the base the settings pages are mounted under.
  const base = location.pathname.split("/").slice(0, 3).join("/");

  return (
    <div className="d2-settings">
      <header className="d2-settings-head">
        <h1 className="d2-settings-title">Settings</h1>
        <p className="d2-settings-sub">Manage your profile, account security, and preferences.</p>
      </header>

      <div className="d2-settings-layout">
        <nav className="d2-settings-nav" aria-label="Settings sections">
          {SECTIONS.map((section) => (
            <NavLink
              key={section.to}
              to={`${base}/${section.to}`}
              end={section.to === "profile"}
              className={({ isActive }) => `d2-settings-nav-item${isActive ? " active" : ""}`}
            >
              <span className="d2-settings-nav-icon">
                <Icon name={section.icon} size={17} />
              </span>
              <span className="d2-settings-nav-copy">
                <span className="d2-settings-nav-label">{section.label}</span>
                <span className="d2-settings-nav-hint">{section.hint}</span>
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="d2-settings-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
