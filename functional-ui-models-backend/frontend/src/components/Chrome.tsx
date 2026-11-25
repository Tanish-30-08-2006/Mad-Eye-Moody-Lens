import { useEffect, useRef, useState } from "react";
import { useScrolled } from "../hooks/useReveal";
import type { BackendState } from "../hooks/useModels";

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

export function Nav({ state }: { state: BackendState }) {
  const scrolled = useScrolled();
  const [utilitiesOpen, setUtilitiesOpen] = useState(false);
  const dropdownRef = useRef<HTMLLIElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    clearCloseTimer();
    setUtilitiesOpen(true);
  };

  const handleMouseLeave = () => {
    clearCloseTimer();
    // 180ms grace period so cursor moving across gap does not prematurely close menu
    closeTimerRef.current = window.setTimeout(() => {
      setUtilitiesOpen(false);
    }, 180);
  };

  const closeMenuImmediately = () => {
    clearCloseTimer();
    setUtilitiesOpen(false);
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeMenuImmediately();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && utilitiesOpen) {
        closeMenuImmediately();
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
      clearCloseTimer();
    };
  }, [utilitiesOpen]);

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
              ref={dropdownRef}
              className="nav__dropdown"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <button
                ref={buttonRef}
                type="button"
                className="nav__dropdown-btn"
                onClick={() => {
                  clearCloseTimer();
                  setUtilitiesOpen((v) => !v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    clearCloseTimer();
                    setUtilitiesOpen((v) => !v);
                  } else if (e.key === "ArrowDown" && !utilitiesOpen) {
                    e.preventDefault();
                    clearCloseTimer();
                    setUtilitiesOpen(true);
                  }
                }}
                aria-expanded={utilitiesOpen}
                aria-haspopup="true"
                aria-controls="forensic-utilities-menu"
              >
                Forensic Utilities <span style={{ fontSize: "8px" }} aria-hidden="true">▼</span>
              </button>
              {utilitiesOpen && (
                <ul
                  id="forensic-utilities-menu"
                  className="nav__dropdown-menu"
                  role="menu"
                  onMouseEnter={clearCloseTimer}
                  onMouseLeave={handleMouseLeave}
                >
                  <li className="nav__dropdown-item" role="none">
                    <a
                      href="#duplicate-detection"
                      role="menuitem"
                      onClick={() => {
                        closeMenuImmediately();
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Duplicate Image Detector
                    </a>
                  </li>
                  <li className="nav__dropdown-item" role="none">
                    <a
                      href="#sha256-generator"
                      role="menuitem"
                      onClick={() => {
                        closeMenuImmediately();
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      SHA-256 Generator &amp; Comparator
                    </a>
                  </li>
                  <li className="nav__dropdown-item" role="none">
                    <a
                      href="#exif-viewer"
                      role="menuitem"
                      onClick={() => {
                        closeMenuImmediately();
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
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
        <div className="nav__status" role="status" aria-live="polite">
          <StatusDot state={state} />
          <span className="label">{STATE_TEXT[state]}</span>
        </div>
      </div>
    </header>
  );
}

export function ForensicNav({
  active,
  onNavigate,
}: {
  active: "duplicate" | "sha256" | "exif";
  onNavigate: (view: "main" | "duplicate" | "sha256" | "exif") => void;
}) {
  return (
    <div className="forensic-nav-bar">
      <a
        href="#analyse"
        className="forensic-nav-btn forensic-nav-btn--back"
        onClick={(e) => {
          e.preventDefault();
          window.location.hash = "";
          window.history.pushState(null, "", "/");
          onNavigate("main");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        ← Back to Deepfake Analyser
      </a>

      <div className="forensic-nav-group">
        <a
          href="#duplicate-detection"
          className={`forensic-nav-btn ${active === "duplicate" ? "is-active" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            window.location.hash = "#duplicate-detection";
            window.history.pushState(null, "", "/duplicate-detection");
            onNavigate("duplicate");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          Duplicate Image Detector
        </a>
        <a
          href="#sha256-generator"
          className={`forensic-nav-btn ${active === "sha256" ? "is-active" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            window.location.hash = "#sha256-generator";
            window.history.pushState(null, "", "/sha256-generator");
            onNavigate("sha256");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          SHA-256 Generator &amp; Comparator
        </a>
        <a
          href="#exif-viewer"
          className={`forensic-nav-btn ${active === "exif" ? "is-active" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            window.location.hash = "#exif-viewer";
            window.history.pushState(null, "", "/exif-viewer");
            onNavigate("exif");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          Image Metadata &amp; EXIF Viewer
        </a>
      </div>
    </div>
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
