import React, { useRef, useState } from "react";
import { validateManifestJson, verifyFilesAgainstManifest } from "../services/manifest.service";
import { hashFile } from "../services/sha256.service";
import { ManifestVerificationSummary, Sha256Manifest } from "../types/sha256.types";
import { formatBytes } from "../utils/file-format";
import { FileDropzone } from "./FileDropzone";
import { ManifestVerificationResults } from "./ManifestVerificationResults";

export function ManifestTab() {
  const [manifestText, setManifestText] = useState("");
  const [manifest, setManifest] = useState<Sha256Manifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [manifestWarning, setManifestWarning] = useState<string | null>(null);

  const [verificationFiles, setVerificationFiles] = useState<File[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState<number>(0);
  const [summary, setSummary] = useState<ManifestVerificationSummary | null>(null);

  const jsonInputRef = useRef<HTMLInputElement>(null);

  const handleJsonTextChange = (text: string) => {
    setManifestText(text);
    setSummary(null);
    if (!text.trim()) {
      setManifest(null);
      setManifestError(null);
      setManifestWarning(null);
      return;
    }

    const res = validateManifestJson(text);
    if (res.valid && res.manifest) {
      setManifest(res.manifest);
      setManifestError(null);
      setManifestWarning(res.duplicateWarning || null);
    } else {
      setManifest(null);
      setManifestError(res.error || "Invalid JSON manifest.");
      setManifestWarning(null);
    }
  };

  const handleJsonFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      handleJsonTextChange(content);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleAddVerificationFiles = (files: File[]) => {
    setVerificationFiles((prev) => [...prev, ...files]);
    setSummary(null);
  };

  const handleClearVerificationFiles = () => {
    setVerificationFiles([]);
    setSummary(null);
  };

  const handleRunVerification = async () => {
    if (!manifest) return;
    setIsVerifying(true);
    setVerifyProgress(0);

    try {
      const hashedFiles: { filename: string; size: number; hash: string }[] = [];
      const total = verificationFiles.length;

      for (let i = 0; i < total; i++) {
        const f = verificationFiles[i];
        const hash = await hashFile(f);
        hashedFiles.push({ filename: f.name, size: f.size, hash });
        setVerifyProgress((i + 1) / total);
      }

      const outcome = verifyFilesAgainstManifest(manifest, hashedFiles);
      setSummary(outcome);
    } catch (err) {
      setManifestError(err instanceof Error ? err.message : "Verification failed unexpectedly.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="sha256-tab-content">
      <div className="sha256-section-header">
        <div>
          <h2 className="sha256-section-title">Manifest Verification Mode</h2>
          <p className="sha256-section-desc">
            Verify a directory of files against a previously exported JSON manifest to detect bitwise modifications,
            missing records, or unexpected additions.
          </p>
        </div>
      </div>

      <div className="sha256-manifest-grid">
        {/* Step 1: Manifest Input */}
        <div className="sha256-manifest-step-card">
          <div className="sha256-step-badge">Step 1</div>
          <h3 className="sha256-step-title">Load SHA-256 Manifest</h3>
          <p className="sha256-step-desc">Upload a `.json` manifest file or paste the raw JSON structure below.</p>

          <input
            ref={jsonInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={handleJsonFileUpload}
          />

          <div style={{ marginBottom: "12px" }}>
            <button
              type="button"
              className="bonsai-btn-secondary sha256-btn-sm"
              onClick={() => jsonInputRef.current?.click()}
            >
              Browse Manifest File (.json)
            </button>
          </div>

          <textarea
            className="sha256-manifest-textarea"
            rows={8}
            placeholder={`{\n  "schemaVersion": "1.0",\n  "algorithm": "SHA-256",\n  "files": [\n    {\n      "filename": "evidence.jpg",\n      "size": 1048576,\n      "hash": "..."\n    }\n  ]\n}`}
            value={manifestText}
            onChange={(e) => handleJsonTextChange(e.target.value)}
          />

          {manifestError && <div className="sha256-error-badge">⚠️ {manifestError}</div>}
          {manifestWarning && <div className="sha256-warning-badge">ℹ️ {manifestWarning}</div>}

          {manifest && (
            <div className="sha256-manifest-meta">
              ✓ Valid Manifest loaded: <strong>{manifest.files.length}</strong> registered files (
              {formatBytes(manifest.totalBytes || 0)})
              {manifest.generatedAt && <div>Created: {new Date(manifest.generatedAt).toLocaleString()}</div>}
            </div>
          )}
        </div>

        {/* Step 2: Verification Files */}
        <div className="sha256-manifest-step-card">
          <div className="sha256-step-badge">Step 2</div>
          <h3 className="sha256-step-title">Upload Files to Verify</h3>
          <p className="sha256-step-desc">
            Provide the local files you wish to inspect against the loaded manifest.
          </p>

          <FileDropzone
            onFilesSelected={handleAddVerificationFiles}
            title="Drop files to verify here"
            subtitle="Select all candidate files from disk"
            disabled={isVerifying}
          />

          {verificationFiles.length > 0 && (
            <div className="sha256-verify-queue">
              <div className="sha256-verify-queue__header">
                <span>
                  <strong>{verificationFiles.length}</strong> candidate files ready for inspection
                </span>
                <button
                  type="button"
                  className="sha256-btn-text"
                  onClick={handleClearVerificationFiles}
                  disabled={isVerifying}
                >
                  Clear Files
                </button>
              </div>

              <div className="sha256-verify-actions">
                <button
                  type="button"
                  className="bonsai-btn-primary"
                  onClick={handleRunVerification}
                  disabled={!manifest || isVerifying || verificationFiles.length === 0}
                >
                  {isVerifying
                    ? `Verifying... (${Math.round(verifyProgress * 100)}%)`
                    : "Verify Files Against Manifest"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {summary && <ManifestVerificationResults summary={summary} />}

      <div className="sha256-forensic-callout">
        <h4>Forensic Notice & Scope of Manifests</h4>
        <p>
          A cryptographic manifest provides deterministic proof of byte integrity at the time of creation.
          However, unsigned JSON manifests do not guarantee non-repudiation or tamper-resistance against direct modification
          of the manifest itself. For legal chain-of-custody requirements, manifests should be cryptographically signed or
          verified against an immutable timestamping authority.
        </p>
      </div>
    </div>
  );
}
