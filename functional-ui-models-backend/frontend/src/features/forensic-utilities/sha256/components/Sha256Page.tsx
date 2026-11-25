import { useState } from "react";
import { CompareTab } from "./CompareTab";
import { GenerateTab } from "./GenerateTab";
import { ManifestTab } from "./ManifestTab";
import "../Sha256Page.css";

interface Sha256PageProps {
  onNavigateHome?: () => void;
  onNavigateDuplicate?: () => void;
  onNavigateExif?: () => void;
}

export function Sha256Page(_props: Sha256PageProps = {}) {
  const [activeTab, setActiveTab] = useState<"generate" | "compare" | "manifest">("generate");

  return (
    <div className="sha256-page">
      <div className="sha256-container">
        {/* Page Header */}
        <header className="sha256-header">
          <span className="sha256-tag">Forensic Utilities · Cryptographic Integrity</span>
          <h1 className="sha256-title">SHA-256 Generator & Comparator</h1>
          <p className="sha256-desc">
            Calculate, compare, and verify cryptographic SHA-256 file fingerprints locally in your browser.
            Raw byte processing with zero server uploads.
          </p>
        </header>

        {/* Privacy Assurance Banner */}
        <div className="sha256-privacy-notice" role="note">
          <span className="sha256-privacy-notice__icon">🛡️</span>
          <div>
            <strong>100% Client-Side Privacy:</strong> All cryptographic operations execute strictly inside your local
            browser memory using the Web Crypto API. Files, filenames, and contents are never uploaded or transmitted
            across the network.
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="sha256-tabs" aria-label="SHA-256 Utilities Tabs">
          <button
            type="button"
            className={`sha256-tab-btn ${activeTab === "generate" ? "sha256-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("generate")}
          >
            1. Generate Hashes
          </button>
          <button
            type="button"
            className={`sha256-tab-btn ${activeTab === "compare" ? "sha256-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("compare")}
          >
            2. Compare Hashes & Files
          </button>
          <button
            type="button"
            className={`sha256-tab-btn ${activeTab === "manifest" ? "sha256-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("manifest")}
          >
            3. Verify Manifest
          </button>
        </nav>

        {/* Tab Body */}
        <main>
          {activeTab === "generate" && <GenerateTab />}
          {activeTab === "compare" && <CompareTab />}
          {activeTab === "manifest" && <ManifestTab />}
        </main>
      </div>
    </div>
  );
}
