import { useEffect, useState } from "react";
import {
  DemoAccountInfo,
  exchangeGoogleCode,
  fetchDemoAccounts,
  fetchMe,
  loginUser,
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

const FALLBACK_DEMO_CREDENTIALS: Record<UserRoleType, { email: string; pass: string }> = {
  public: { email: "public@moodylens.local", pass: "Public123!" },
  journalist: { email: "journalist@reuters-factcheck.org", pass: "Journalist123!" },
  enterprise_admin: { email: "moderator@meta-safety.internal", pass: "Enterprise123!" },
  govt_officer: { email: "officer@cert-in.gov.in", pass: "GovtOfficer123!" },
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
      logout();
      return;
    }
    const cred = demoAccounts.find((a) => a.role === role) || FALLBACK_DEMO_CREDENTIALS[role];
    if (!cred) return;
    const password = "password" in cred ? cred.password : cred.pass;
    await login(cred.email, password);
  };

  const logout = () => {
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
