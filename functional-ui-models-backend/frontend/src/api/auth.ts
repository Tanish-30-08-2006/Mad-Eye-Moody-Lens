import { API_BASE, ApiError } from "./client";

export type UserRoleType = "public" | "journalist" | "enterprise_admin" | "govt_officer";
export type SubscriptionTierType = "community" | "journalist_pro" | "enterprise_suite" | "sovereign_govtech";

export interface UserProfile {
  user_id?: string | null;
  email: string;
  role: UserRoleType;
  org_name?: string | null;
  subscription_tier: SubscriptionTierType;
  permissions: string[];
  is_anonymous: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}

export interface DemoAccountInfo {
  stakeholder_name: string;
  role: UserRoleType;
  tier: SubscriptionTierType;
  email: string;
  password: string;
  description: string;
  unlocked_features: string[];
}

export interface OAuthProviderInfo {
  provider_id: string;
  name: string;
  auth_url: string;
  enabled: boolean;
}

export async function fetchDemoAccounts(): Promise<DemoAccountInfo[]> {
  const res = await fetch(`${API_BASE}/api/v1/auth/demo-accounts`);
  if (!res.ok) throw new ApiError("Failed to fetch demo accounts", res.status);
  return res.json();
}

export async function fetchMe(token?: string | null): Promise<UserProfile> {
  const headers: HeadersInit = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/v1/auth/me`, { headers });
  if (!res.ok) throw new ApiError("Failed to fetch profile", res.status);
  return res.json();
}

export async function loginUser(email: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || data.detail || "Authentication failed", res.status);
  }
  return res.json();
}

export async function oauthLogin(provider: string, code: string, role?: UserRoleType): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auth/oauth/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, code, role }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || data.detail || "OAuth failed", res.status);
  }
  return res.json();
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
  role: UserRoleType = "public"
): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auth/oauth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: redirectUri, role }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || data.detail || "Google authentication failed", res.status);
  }
  return res.json();
}

export async function logoutUser(token: string): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/v1/auth/logout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || data.detail || "Logout failed", res.status);
  }
  return res.json();
}
