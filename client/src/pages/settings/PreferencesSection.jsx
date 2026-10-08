import Icon from "../../Icon.jsx";
import { useTheme } from "../../theme.jsx";

export default function PreferencesSection() {
  const { dark, setDark } = useTheme();

  return (
    <div className="d2-settings-section">
      <div className="d2-settings-card">
        <h2 className="d2-settings-card-title">Appearance</h2>
        <p className="d2-settings-card-sub">
          Choose how SmartAgri looks for you. Your choice is saved on this device.
        </p>

        <div className="d2-theme-options" role="radiogroup" aria-label="Theme">
          <button
            type="button"
            className={`d2-theme-option${!dark ? " active" : ""}`}
            onClick={() => setDark(false)}
            role="radio"
            aria-checked={!dark}
          >
            <span className="d2-theme-option-icon"><Icon name="sunny-outline" size={20} /></span>
            <span className="d2-theme-option-copy">
              <span className="d2-theme-option-label">Light</span>
              <span className="d2-theme-option-desc">Bright and clean</span>
            </span>
            {!dark && <Icon name="checkmark-circle-outline" size={17} className="d2-theme-option-check" />}
          </button>

          <button
            type="button"
            className={`d2-theme-option${dark ? " active" : ""}`}
            onClick={() => setDark(true)}
            role="radio"
            aria-checked={dark}
          >
            <span className="d2-theme-option-icon"><Icon name="moon-outline" size={20} /></span>
            <span className="d2-theme-option-copy">
              <span className="d2-theme-option-label">Dark</span>
              <span className="d2-theme-option-desc">Easy on the eyes</span>
            </span>
            {dark && <Icon name="checkmark-circle-outline" size={17} className="d2-theme-option-check" />}
          </button>
        </div>
      </div>
    </div>
  );
}
