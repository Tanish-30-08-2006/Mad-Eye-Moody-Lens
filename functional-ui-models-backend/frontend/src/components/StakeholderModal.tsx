import { useEffect, useRef, useState } from "react";
import { DemoAccountInfo, UserProfile, UserRoleType } from "../api/auth";

interface StakeholderModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  demoAccounts: DemoAccountInfo[];
  onSwitchDemoRole: (role: UserRoleType) => Promise<void>;
  onLogin: (email: string, password: string) => Promise<unknown>;
  onLogout: () => void;
}

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "600597859950-15ag9l82s80irnr4e340mbo29tfb6gcr.apps.googleusercontent.com";

interface AuthorityMeta {
  role: UserRoleType;
  title: string;
  badge: string;
  tier: string;
  icon: string;
  color: string;
  desc: string;
  features: string[];
}

const AUTHORITIES: AuthorityMeta[] = [
  {
    role: "govt_officer",
    title: "Government Official",
    badge: "Sovereign GovTech",
    tier: "Tier 3 · Law Enforcement",
    icon: "🏛️",
    color: "#7c3aed",
    desc: "National Security, CERT-In, Law Enforcement Cyber Cells. Access statutory tagging, sovereign threat streams, and court evidence bundles.",
    features: [
      "Sovereign disinformation threat stream & tracking",
      "Section 66D IT Act & BNS 2023 statutory tagging",
      "Emergency Section 69A takedown notice generator",
      "Immutable SHA-256 evidentiary chain of custody",
    ],
  },
  {
    role: "enterprise_admin",
    title: "Social Media Platform",
    badge: "Enterprise Suite",
    tier: "Tier 2 · Platform B2B",
    icon: "🛡️",
    color: "#2563eb",
    desc: "Platform Trust & Safety teams (Meta, Reddit, X). In-situ offending account telemetry extraction and compliance warning dispatcher.",
    features: [
      "Offending account telemetry capture (@handle, UID, IP)",
      "1-Click user compliance warning dispatcher",
      "Flagged feed moderation queue & live telemetry",
      "Direct escalation conduit to Cyber Crime Authority",
    ],
  },
  {
    role: "journalist",
    title: "Investigative Journalist",
    badge: "Journalist Pro",
    tier: "Tier 1 · Media License",
    icon: "🔍",
    color: "#0d9488",
    desc: "Verified newsrooms (Reuters, AP) and fact-checking desks. Deep XAI explainability with Grad-CAM attention heatmaps and PDF dossiers.",
    features: [
      "Interactive Grad-CAM attention heatmap overlay",
      "Tamper percentage breakdown & 0-100% opacity slider",
      "Certified watermarked forensic PDF audit dossier export",
      "C2PA provenance digital signature inspection",
    ],
  },
];

export function StakeholderModal({
  isOpen,
  onClose,
  currentUser,
  demoAccounts,
  onSwitchDemoRole,
  onLogin,
  onLogout,
}: StakeholderModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedRole, setSelectedRole] = useState<UserRoleType | null>(null);
  const [showManualLogin, setShowManualLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
      // If user is already authenticated with a specific role, pre-select it
      if (currentUser && currentUser.role !== "public") {
        setSelectedRole(currentUser.role);
      } else {
        setSelectedRole(null);
      }
      setShowManualLogin(false);
      setErrorMsg(null);
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen, currentUser]);

  const handleClose = () => {
    setErrorMsg(null);
    onClose();
  };

  const handleSelectAuthority = (role: UserRoleType) => {
    if (role === "public") {
      onLogout();
      handleClose();
      return;
    }
    setSelectedRole(role);
    setErrorMsg(null);
  };

  const handleGoogleSignIn = () => {
    setBusy(true);
    setErrorMsg(null);
    const roleToUse = selectedRole || "public";
    // Persist selected authority in sessionStorage so callback knows which authority was picked
    sessionStorage.setItem("mml_selected_authority", roleToUse);

    const redirectUri = `${window.location.origin}/oauth/callback`;
    const state = `${Math.random().toString(36).substring(2)}:::${roleToUse}`;
    sessionStorage.setItem("mml_oauth_state", state);

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("prompt", "select_account");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("state", state);

    window.location.href = authUrl.toString();
  };

  const handleQuickDemoSwitch = async (role: UserRoleType) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await onSwitchDemoRole(role);
      handleClose();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to switch persona");
    } finally {
      setBusy(false);
    }
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      await onLogin(email, password);
      handleClose();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Invalid credentials");
    } finally {
      setBusy(false);
    }
  };

  const activeAuthorityMeta = AUTHORITIES.find((a) => a.role === selectedRole);

  return (
    <dialog
      ref={dialogRef}
      className="stakeholder-modal"
      onClose={handleClose}
      aria-labelledby="stakeholder-modal-title"
    >
      <div className="stakeholder-modal__container" style={{ maxWidth: "860px" }}>
        <header className="stakeholder-modal__header">
          <div>
            <span className="label" style={{ color: "var(--primary)" }}>
              Access Management · Role-Based Access Control (RBAC)
            </span>
            <h2 id="stakeholder-modal-title" className="stakeholder-modal__title">
              {selectedRole ? "Sign In as Institutional Authority" : "Select Your Authority"}
            </h2>
          </div>
          <button
            type="button"
            className="stakeholder-modal__close-btn"
            onClick={handleClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </header>

        {errorMsg && (
          <div className="stakeholder-modal__error" role="alert">
            {errorMsg}
          </div>
        )}

        {/* STEP 1: Authority Selection */}
        {!selectedRole ? (
          <div>
            <p style={{ color: "var(--subtle, #94a3b8)", fontSize: "14px", margin: "4px 0 18px 0" }}>
              You are currently browsing in <strong>Guest Mode (Zero-Login Public)</strong>. To unlock institutional moderation,
              defamation dockets, or deep forensic heatmaps, select your authority:
            </p>

            <div className="stakeholder-modal__grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {/* Option 1: Government Official */}
              <div
                className={`stakeholder-card ${currentUser.role === "govt_officer" ? "stakeholder-card--selected" : ""}`}
                style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}
              >
                <div>
                  <div className="stakeholder-card__header">
                    <span className="persona-badge persona-badge--govt">Sovereign GovTech</span>
                    <span className="tier-tag">Tier 3</span>
                  </div>
                  <h3 className="stakeholder-card__name" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>🏛️</span> Government Official
                  </h3>
                  <p className="stakeholder-card__desc">
                    Law Enforcement, CERT-In, Sovereign Cyber Cells. National security feed, defamation case tracking, Section 66D IT Act tagging.
                  </p>
                  <ul className="stakeholder-card__features">
                    <li>✓ Sovereign threat tracking &amp; alerts</li>
                    <li>✓ National defamation case docket</li>
                    <li>✓ Section 66D IT Act statutory tagging</li>
                    <li>✓ Emergency Section 69A takedown notices</li>
                  </ul>
                  <div
                    style={{
                      marginTop: "10px",
                      padding: "6px 10px",
                      borderRadius: "4px",
                      background: "rgba(124, 58, 237, 0.12)",
                      border: "1px solid rgba(124, 58, 237, 0.3)",
                      fontSize: "11px",
                      color: "#c4b5fd",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span>🔒</span>
                    <span>Requires <code>.gov.in</code>, <code>.nic.in</code>, <code>.gov</code>, or <code>.gov.uk</code></span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ width: "100%", marginTop: "16px" }}
                  onClick={() => handleSelectAuthority("govt_officer")}
                >
                  Select Government Official →
                </button>
              </div>

              {/* Option 2: Social Media Platform */}
              <div
                className={`stakeholder-card ${currentUser.role === "enterprise_admin" ? "stakeholder-card--selected" : ""}`}
                style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}
              >
                <div>
                  <div className="stakeholder-card__header">
                    <span className="persona-badge persona-badge--enterprise">Enterprise Suite</span>
                    <span className="tier-tag">Tier 2</span>
                  </div>
                  <h3 className="stakeholder-card__name" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>🛡️</span> Social Media Platform
                  </h3>
                  <p className="stakeholder-card__desc">
                    Platform Trust &amp; Safety teams (Meta, Reddit, X). In-situ offending account telemetry (@handle, UID, IP), user warning dispatcher.
                  </p>
                  <ul className="stakeholder-card__features">
                    <li>✓ Offending account telemetry extraction</li>
                    <li>✓ 1-Click user compliance warning dispatch</li>
                    <li>✓ Flagged content moderation queue</li>
                    <li>✓ High-throughput batch streaming API</li>
                  </ul>
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ width: "100%", marginTop: "16px" }}
                  onClick={() => handleSelectAuthority("enterprise_admin")}
                >
                  Select Social Media Platform →
                </button>
              </div>

              {/* Option 3: Investigative Journalist */}
              <div
                className={`stakeholder-card ${currentUser.role === "journalist" ? "stakeholder-card--selected" : ""}`}
                style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}
              >
                <div>
                  <div className="stakeholder-card__header">
                    <span className="persona-badge persona-badge--journalist">Journalist Pro</span>
                    <span className="tier-tag">Tier 1</span>
                  </div>
                  <h3 className="stakeholder-card__name" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>🔍</span> Investigative Journalist
                  </h3>
                  <p className="stakeholder-card__desc">
                    Fact-checkers &amp; newsrooms (Reuters, AP). Explainable AI with Grad-CAM heatmaps, tamper % breakdown, and PDF dossiers.
                  </p>
                  <ul className="stakeholder-card__features">
                    <li>✓ Interactive Grad-CAM attention heatmap</li>
                    <li>✓ Tamper breakdown % &amp; opacity slider</li>
                    <li>✓ Certified watermarked PDF dossier export</li>
                    <li>✓ C2PA digital signature inspection</li>
                  </ul>
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ width: "100%", marginTop: "16px" }}
                  onClick={() => handleSelectAuthority("journalist")}
                >
                  Select Journalist →
                </button>
              </div>
            </div>

            {/* Guest Fallback Box */}
            <div
              style={{
                marginTop: "20px",
                padding: "14px 18px",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px dashed var(--border)",
                borderRadius: "var(--radius)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "14px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <span style={{ fontWeight: 600, fontSize: "14px" }}>👤 Continue as Guest (General Public)</span>
                <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "var(--subtle)" }}>
                  Zero login required. Rapid real/fake verdict (&lt; 1s) and perceptual image duplicate detector.
                </p>
              </div>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => {
                  if (currentUser.role !== "public") onLogout();
                  handleClose();
                }}
              >
                {currentUser.role === "public" ? "Stay as Guest (Active)" : "Switch to Guest"}
              </button>
            </div>
          </div>
        ) : (
          /* STEP 2: Selected Authority Sign-In */
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Selected Authority Summary Card */}
            <div
              style={{
                padding: "16px 20px",
                borderRadius: "var(--radius)",
                background: "rgba(255, 255, 255, 0.04)",
                border: `1px solid ${activeAuthorityMeta?.color || "var(--primary)"}40`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "28px" }}>{activeAuthorityMeta?.icon}</span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontWeight: 700, fontSize: "16px" }}>{activeAuthorityMeta?.title}</span>
                    <span className="tier-tag">{activeAuthorityMeta?.tier}</span>
                  </div>
                  <p style={{ margin: "2px 0 0 0", fontSize: "13px", color: "var(--subtle)" }}>
                    {activeAuthorityMeta?.desc}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setSelectedRole(null)}
                style={{ fontSize: "12px", textDecoration: "underline" }}
              >
                ← Change Authority
              </button>
            </div>

            {/* Google Workspace Sign In Card */}
            <div
              style={{
                padding: "24px 20px",
                borderRadius: "var(--radius)",
                background: "rgba(66, 133, 244, 0.05)",
                border: "1px solid rgba(66, 133, 244, 0.25)",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "14px",
              }}
            >
              <div style={{ maxWidth: "520px" }}>
                <span className="label" style={{ color: "#4285F4", letterSpacing: "1px" }}>
                  ORGANIZATIONAL FEDERATED AUTHENTICATION
                </span>
                <h3 style={{ margin: "6px 0 6px 0", fontSize: "18px" }}>
                  Sign in with Google Workspace as {activeAuthorityMeta?.title}
                </h3>
                <p style={{ fontSize: "13px", color: "var(--subtle)", margin: 0 }}>
                  Click below to open Google&apos;s live account chooser, select your organizational account, and securely mint
                  your <strong>{activeAuthorityMeta?.badge}</strong> session.
                </p>
              </div>

              {selectedRole === "govt_officer" && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "6px",
                    background: "rgba(234, 179, 8, 0.12)",
                    border: "1px solid rgba(234, 179, 8, 0.35)",
                    color: "#fde047",
                    fontSize: "12px",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    maxWidth: "540px",
                    margin: "0 auto",
                  }}
                >
                  <span style={{ fontSize: "16px", lineHeight: "1" }}>🔒</span>
                  <div>
                    <strong>Sovereign Clearance Enforcement:</strong> Access to Government Cyber Crime tools is exclusively granted to verified official government email addresses (e.g. <code>.gov.in</code> or <code>.nic.in</code> for India; <code>.gov</code>, <code>.mil</code>, <code>.gov.uk</code> internationally). Any non-government Google account will be denied clearance.
                  </div>
                </div>
              )}

              <button
                type="button"
                className="btn btn--outline oauth-btn oauth-btn--google"
                disabled={busy}
                onClick={handleGoogleSignIn}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "12px",
                  fontWeight: 600,
                  fontSize: "15px",
                  padding: "14px 28px",
                  borderColor: "rgba(255, 255, 255, 0.25)",
                  background: "rgba(255, 255, 255, 0.08)",
                  cursor: "pointer",
                  borderRadius: "8px",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                {busy ? "Connecting to Google..." : `Sign in with Google as ${activeAuthorityMeta?.title}`}
              </button>

              <div style={{ display: "flex", gap: "18px", fontSize: "12px", color: "var(--subtle)" }}>
                <span>✓ Prompts Google Account Chooser</span>
                <span>✓ Binds to {activeAuthorityMeta?.tier}</span>
                <span>✓ End-to-End JWT RBAC</span>
              </div>
            </div>

            {/* Alternative: 1-Click Fast Demo Switch / Password Credentials */}
            <div style={{ marginTop: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setShowManualLogin((v) => !v)}
                  style={{ fontSize: "12px", color: "var(--subtle)" }}
                >
                  {showManualLogin ? "Hide Demo & Credentials Login ▲" : "Or use pre-seeded test credentials ▼"}
                </button>

                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={() => handleQuickDemoSwitch(selectedRole)}
                  disabled={busy}
                  style={{ fontSize: "12px" }}
                >
                  ⚡ 1-Click Demo Switch to {activeAuthorityMeta?.title}
                </button>
              </div>

              {showManualLogin && (
                <div style={{ marginTop: "14px", padding: "16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "var(--radius)" }}>
                  {demoAccounts.length > 0 && (
                    <p style={{ fontSize: "11px", color: "var(--subtle)", marginBottom: "10px" }}>
                      Pre-seeded test login: <code>{demoAccounts.find((d) => d.role === selectedRole)?.email || "officer@cert-in.gov.in"}</code> (Password: <code>{selectedRole === "govt_officer" ? "GovtOfficer123!" : selectedRole === "enterprise_admin" ? "Enterprise123!" : "Journalist123!"}</code>)
                    </p>
                  )}
                  <form onSubmit={handleManualLogin} className="login-form">
                    <label className="field-label">
                      <span>Stakeholder Email Address</span>
                      <input
                        type="email"
                        required
                        placeholder="e.g. officer@cert-in.gov.in"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="input-field"
                      />
                    </label>

                    <label className="field-label">
                      <span>Account Password</span>
                      <input
                        type="password"
                        required
                        placeholder="Enter password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input-field"
                      />
                    </label>

                    <button type="submit" className="btn btn--primary btn--full" disabled={busy}>
                      {busy ? "Authenticating..." : "Sign In with Credentials"}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}

        <footer className="stakeholder-modal__footer">
          <span className="label">
            Current Identity: <strong>{currentUser.email}</strong> (
            {currentUser.is_anonymous ? "GUEST" : currentUser.subscription_tier.toUpperCase()})
          </span>
          {currentUser.role !== "public" && (
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                onLogout();
                setSelectedRole(null);
              }}
            >
              Sign Out to Anonymous Guest
            </button>
          )}
        </footer>
      </div>
    </dialog>
  );
}
