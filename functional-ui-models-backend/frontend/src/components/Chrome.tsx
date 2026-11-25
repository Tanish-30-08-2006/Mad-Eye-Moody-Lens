import { useState } from "react";
import { useScrolled } from "../hooks/useReveal";
import type { BackendState } from "../hooks/useModels";
import type { UserProfile } from "../api/auth";

export function GridBackground() {
  return (
    <div className="bg-structure" aria-hidden="true">
      <div className="bg-structure__grid" />
      <div className="bg-structure__cols">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export const STATE_TEXT: Record<BackendState, string> = {
  connecting: "Connecting",
  warming: "Loading models",
  online: "Detectors online",
  offline: "Backend offline",
};

export function StatusDot({ state }: { state: BackendState }) {
  const cls =
    state === "online" ? "dot--online" : state === "warming" ? "dot--warming" : state === "offline" ? "dot--offline" : "";
  return <span className={`dot ${cls} ${state === "offline" ? "" : "dot--pulse"}`} aria-hidden="true" />;
}

const LINKS = [
  ["Models", "#models"],
  ["How it works", "#how"],
  ["History", "#history"],
  ["Limitations", "#limitations"],
] as const;

export function Nav({
  state,
  user,
  onOpenStakeholderModal,
}: {
  state: BackendState;
  user?: UserProfile;
  onOpenStakeholderModal?: () => void;
}) {
  const scrolled = useScrolled();
  const [utilitiesOpen, setUtilitiesOpen] = useState(false);

  const isGuest = !user || user.role === "public" || user.is_anonymous;

  const roleEmoji =
    user?.role === "govt_officer"
      ? "🏛️"
      : user?.role === "enterprise_admin"
      ? "🛡️"
      : user?.role === "journalist"
      ? "🔍"
      : "👤";

  const roleShortName =
    user?.role === "govt_officer"
      ? "Govt Official"
      : user?.role === "enterprise_admin"
      ? "Social Media Platform"
      : user?.role === "journalist"
      ? "Journalist Pro"
      : "Guest";

  return (
    <header className={`nav ${scrolled ? "is-scrolled" : ""}`}>
      <div className="container nav__inner">
        <a className="brand" href="#top" aria-label="Mad-Eye Moody Lens, back to top">
          <span className="brand__bar brand__bar--a" aria-hidden="true" />
          Mad-Eye Moody Lens
          <span className="brand__bar brand__bar--b" aria-hidden="true" />
        </a>
        <nav aria-label="Primary">
          <ul className="nav__links">
            <li>
              <a href="#analyse">Analyse</a>
            </li>

            <li
              className="nav__dropdown"
              onMouseEnter={() => setUtilitiesOpen(true)}
              onMouseLeave={() => setUtilitiesOpen(false)}
            >
              <button
                type="button"
                className="nav__dropdown-btn"
                onClick={() => setUtilitiesOpen((v) => !v)}
                aria-expanded={utilitiesOpen}
                aria-haspopup="true"
              >
                Forensic Utilities <span style={{ fontSize: "8px" }} aria-hidden="true">▼</span>
              </button>
              {utilitiesOpen && (
                <ul className="nav__dropdown-menu">
                  <li className="nav__dropdown-item">
                    <a href="#duplicate-detection" onClick={() => setUtilitiesOpen(false)}>
                      Duplicate Image Detector
                    </a>
                  </li>
                  <li className="nav__dropdown-item">
                    <a href="#sha256-generator" onClick={() => setUtilitiesOpen(false)}>
                      SHA-256 Generator &amp; Comparator
                    </a>
                  </li>
                  <li className="nav__dropdown-item">
                    <a href="#exif-viewer" onClick={() => setUtilitiesOpen(false)}>
                      Image Metadata &amp; EXIF Viewer
                    </a>
                  </li>
                </ul>
              )}
            </li>

            {LINKS.map(([label, href]) => (
              <li key={href}>
                <a href={href}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div className="nav__status" role="status" aria-live="polite">
            <StatusDot state={state} />
            <span className="label">{STATE_TEXT[state]}</span>
          </div>
          {onOpenStakeholderModal && (
            <button
              type="button"
              className={`nav__signin-tab ${isGuest ? "" : "nav__signin-tab--authenticated"}`}
              onClick={onOpenStakeholderModal}
              title={isGuest ? "Sign In" : `Signed in: ${user?.email}`}
            >
              {isGuest ? (
                "Sign In"
              ) : (
                <>
                  <span>{roleEmoji}</span>
                  <span>{roleShortName}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <span className="label">Mad-Eye Moody Lens · IT314 Software Engineering · Sprint 2</span>
        <span className="label">Probabilistic estimates · not forensic proof</span>
      </div>
    </footer>
  );
}
