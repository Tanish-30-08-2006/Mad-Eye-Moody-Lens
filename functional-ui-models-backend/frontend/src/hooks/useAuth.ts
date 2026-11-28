import { useEffect, useState } from "react";
import {
  DemoAccountInfo,
  exchangeGoogleCode,
  fetchDemoAccounts,
  fetchMe,
  loginUser,
  logoutUser,
  UserProfile,
  UserRoleType,
} from "../api/auth";

const TOKEN_KEY = "mml_access_token";

const DEFAULT_ANONYMOUS_USER: UserProfile = {
  email: "anonymous@moodylens.local",
  role: "public",
  org_name: "General Public",
  subscription_tier: "community",
  permissions: ["analyze:basic", "compare:duplicate", "read:verdict"],
  is_anonymous: true,
};

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<UserProfile>(DEFAULT_ANONYMOUS_USER);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccountInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load demo accounts
  useEffect(() => {
    fetchDemoAccounts()
      .then(setDemoAccounts)
      .catch((err) => console.warn("Could not load demo accounts", err));
  }, []);

  // Sync user state with token
  useEffect(() => {
    let mounted = true;
    if (!token) {
      setUser(DEFAULT_ANONYMOUS_USER);
      return;
    }

    setLoading(true);
    fetchMe(token)
      .then((profile) => {
        if (mounted) {
          setUser(profile);
          setError(null);
        }
      })
      .catch(() => {
        if (mounted) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(DEFAULT_ANONYMOUS_USER);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await loginUser(email, password);
      localStorage.setItem(TOKEN_KEY, data.access_token);
      setToken(data.access_token);
      setUser(data.user);
      return data.user;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async (code: string, redirectUri: string, role: UserRoleType = "public") => {
    setLoading(true);
    setError(null);
    try {
      const data = await exchangeGoogleCode(code, redirectUri, role);
      localStorage.setItem(TOKEN_KEY, data.access_token);
      setToken(data.access_token);
      setUser(data.user);
      return data.user;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google login failed";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const switchDemoRole = async (role: UserRoleType) => {
    if (role === "public") {
      await logout();
      return;
    }
    const cred = demoAccounts.find((a) => a.role === role);
    if (!cred || !cred.password) return;
    await login(cred.email, cred.password);
  };

  const logout = async () => {
    if (token) {
      try {
        await logoutUser(token);
      } catch (err) {
        console.warn("Logout token revocation failed or server unreachable:", err);
      }
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(DEFAULT_ANONYMOUS_USER);
    setError(null);
  };

  return {
    token,
    user,
    demoAccounts,
    loading,
    error,
    login,
    loginWithGoogle,
    switchDemoRole,
    logout,
  };
}
