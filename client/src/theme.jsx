import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// The same storage key the app already used, so existing preferences carry over.
const THEME_KEY = "smartagri_theme";

const ThemeContext = createContext(null);

export const useTheme = () => useContext(ThemeContext);

const applyTheme = (dark) => {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  try {
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  } catch {
    /* storage unavailable — theme still applies for this session */
  }
};

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    let stored = "light";
    try {
      stored = localStorage.getItem(THEME_KEY) || "light";
    } catch {
      /* ignore */
    }
    // Apply synchronously before first paint to avoid a flash of light theme.
    document.documentElement.setAttribute("data-theme", stored);
    return stored === "dark";
  });

  useEffect(() => {
    applyTheme(dark);
  }, [dark]);

  const toggleTheme = useCallback(() => setDark((value) => !value), []);

  const value = useMemo(() => ({ dark, setDark, toggleTheme }), [dark, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
