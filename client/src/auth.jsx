import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken } from "./api.js";

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

const homeByRole = (role) => {
  if (role === "farmer") return "/farmer";
  if (role === "admin") return "/admin";
  return "/buyer";
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore the session on first load
  useEffect(() => {
    const restore = async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { user } = await api.get("/api/auth/me");
        setUser(user);
      } catch {
        setToken(null);
      } finally {
        setLoading(false);
      }
    };
    restore();
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const data = await api.post("/api/auth/login", { email, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(
    async ({ fullName, phoneNumber, email, role, businessName, location, password }) => {
      const data = await api.post("/api/auth/register", {
        fullName,
        phoneNumber,
        email,
        role,
        businessName,
        location,
        password,
      });
      setToken(data.token);
      setUser(data.user);
      return data.user;
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // ignore — token is discarded locally regardless
    }
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const { user } = await api.get("/api/auth/me");
    setUser(user);
    return user;
  }, []);

  const value = useMemo(
    () => ({ user, setUser, loading, login, register, logout, refresh, homeByRole }),
    [user, loading, login, register, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
