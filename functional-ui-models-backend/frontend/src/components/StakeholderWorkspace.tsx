import { useState } from "react";
import { UserProfile } from "../api/auth";

interface StakeholderWorkspaceProps {
  user: UserProfile;
  onOpenModal: () => void;
  onLogout: () => void;
}

export function StakeholderWorkspace({ user, onOpenModal, onLogout }: StakeholderWorkspaceProps) {
  const [warningSent, setWarningSent] = useState(false);
  const [caseDocketed, setCaseDocketed] = useState(false);

  // When browsing as Guest (Public citizen), do not render any abrupt placeholder bar
  if (!user || user.is_anonymous || user.role === "public") {
    return null;
  }

  const roleLabels: Record<string, { title: string; badge: string; color: string }> = {
    public: { title: "General Public Citizen", badge: "Zero-Login Fallback", color: "var(--subtle)" },
    journalist: { title: "Investigative Journalist / Fact-Checker", badge: "Journalist Pro", color: "#3d7068" },
    enterprise_admin: { title: "Social Media Platform Moderator", badge: "Enterprise Suite", color: "#2563eb" },
    govt_officer: { title: "Government Cyber Crime Authority", badge: "Sovereign GovTech", color: "#7c3aed" },
  };

  const currentMeta = roleLabels[user.role] || roleLabels.public;

  return (
    <section className="stakeholder-workspace" aria-label="Stakeholder Workspace Context">
      <div className="container">
        <div className="stakeholder-workspace__bar">
          <div className="stakeholder-workspace__identity">
            <span
              className="stakeholder-workspace__badge"
              style={{ backgroundColor: `${currentMeta.color}15`, color: currentMeta.color, borderColor: currentMeta.color }}
            >
              {currentMeta.badge}
            </span>
            <div className="stakeholder-workspace__details">
              <span className="stakeholder-workspace__role">{currentMeta.title}</span>
              <span className="stakeholder-workspace__email">
                Identity: <strong>{user.email}</strong> · Org: {user.org_name || "N/A"} · Tier:{" "}
                <span className="tier-pill">{user.subscription_tier.replace("_", " ").toUpperCase()}</span>
              </span>
            </div>
          </div>

          <div className="stakeholder-workspace__actions">
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={onOpenModal}
              title="Change active stakeholder persona or login"
            >
              ⇄ Switch Persona / Login
            </button>
            {!user.is_anonymous && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={onLogout}
                title="Reset to anonymous citizen zero-login"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>

        {/* Role-Specific Workspaces */}
        {user.role === "enterprise_admin" && (
          <div className="stakeholder-feature-panel stakeholder-feature-panel--enterprise">
            <div className="stakeholder-feature-panel__header">
              <span className="mono label">🛡️ ENTERPRISE MODERATION TOOLBAR · B2B SAAS FEED</span>
              <span className="badge badge--live">LIVE TELEMETRY STREAM ACTIVE</span>
            </div>
            <div className="stakeholder-feature-panel__body">
              <div className="telemetry-card">
                <span className="telemetry-label">Offending Account Telemetry:</span>
                <span className="telemetry-val">@impostor_deepfake_99</span>
                <span className="telemetry-label">Origin Platform:</span>
                <span className="telemetry-val">Instagram Reels / Post #882194</span>
                <span className="telemetry-label">UID / Fingerprint:</span>
                <span className="telemetry-val mono">usr_meta_9829410_f9</span>
              </div>
              <div className="telemetry-actions">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => setWarningSent(true)}
                  disabled={warningSent}
                >
                  {warningSent ? "✓ Warning Dispatched & Escalated" : "⚠️ Dispatch User Warning & Escalate"}
                </button>
                {warningSent && (
                  <span className="success-tag">
                    Notice transmitted to user profile & flagged into sovereign disinformation queue.
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {user.role === "govt_officer" && (
          <div className="stakeholder-feature-panel stakeholder-feature-panel--govt">
            <div className="stakeholder-feature-panel__header">
              <span className="mono label">🏛️ SOVEREIGN DISINFORMATION & DEFAMATION DOCKET</span>
              <span className="badge badge--sovereign">CERT-IN LAW ENFORCEMENT</span>
            </div>
            <div className="stakeholder-feature-panel__body">
              <div className="telemetry-card">
                <span className="telemetry-label">Statutory Offense Tag:</span>
                <span className="telemetry-val">Section 66D IT Act & BNS 2023 (Impersonation by Cheating)</span>
                <span className="telemetry-label">National Case Docket:</span>
                <span className="telemetry-val mono">DEFAM-IN-2026-90412</span>
                <span className="telemetry-label">Target Entity:</span>
                <span className="telemetry-val">National Defense / Public Figures</span>
              </div>
              <div className="telemetry-actions">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => setCaseDocketed(true)}
                  disabled={caseDocketed}
                >
                  {caseDocketed ? "✓ Case Docketed & Evidence Sealed" : "⚖️ Register Legal Case & Freeze Evidence"}
                </button>
                {caseDocketed && (
                  <span className="success-tag">
                    SHA-256 evidence sealed in forensic court dossier with statutory digital timestamp.
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {user.role === "journalist" && (
          <div className="stakeholder-feature-panel stakeholder-feature-panel--journalist">
            <div className="stakeholder-feature-panel__header">
              <span className="mono label">🔍 FACT-CHECKER WORKSPACE · FORENSIC HEATMAP UNLOCKED</span>
              <span className="badge badge--pro">JOURNALIST PRO LICENSE</span>
            </div>
            <p className="stakeholder-feature-panel__note">
              Grad-CAM attention heatmap analysis and certified PDF audit dossier export are active.
              Inspect manipulated face regions and verify attribution directly below in the Analyser.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
