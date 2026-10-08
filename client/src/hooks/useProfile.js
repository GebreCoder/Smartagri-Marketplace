import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, uploadImage } from "../api.js";
import { useAuth } from "../auth.jsx";

/**
 * Shared profile-editing logic used by both the standalone profile page and
 * the Settings → My Profile section. Handles loading, photo upload, saving,
 * and logout exactly as the original page did.
 */
export default function useProfile() {
  const navigate = useNavigate();
  const { refresh, logout } = useAuth();

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { user: data } = await api.get("/api/auth/me");
      setProfile(data);
      setForm({
        fullName: data.full_name || "",
        phoneNumber: data.phone_number || "",
        location: data.location || "",
        businessName: data.business_name || "",
        biography: data.biography || "",
      });
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    setSaved(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.patch("/api/users/me", form);
      setSaved(true);
      await refresh();
      await load();
      // Keep the dashboard shell's header/sidebar name in sync.
      window.dispatchEvent(new Event("smartagri:profile-updated"));
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message || "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  const handlePhoto = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const data = await uploadImage(file);
      await api.patch("/api/users/me/photo", { profileImageUrl: data.url });
      await refresh();
      await load();
      window.dispatchEvent(new Event("smartagri:profile-updated"));
    } catch (err) {
      alert(err.message || "Photo upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return {
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
  };
}
