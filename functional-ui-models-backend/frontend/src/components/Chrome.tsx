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
  ["Analyse", "#analyse"],
  ["Models", "#models"],
  ["How it works", "#how"],
  ["History", "#history"],
  ["Limitations", "#limitations"],
] as const;

export function Nav({ state }: { state: BackendState }) {
  const scrolled = useScrolled();
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
