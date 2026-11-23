import { useState } from "react";
import { hashFile } from "../services/sha256.service";
import { HashComparisonResult } from "../types/sha256.types";
import { formatBytes, getFileExtension } from "../utils/file-format";
import { compareHashStrings, getHashValidationError, normalizeHash } from "../utils/hash-validation";
import { ComparisonResult } from "./ComparisonResult";
import { FileDropzone } from "./FileDropzone";

export function CompareTab() {
  const [mode, setMode] = useState<"paste" | "files">("paste");

  // Option 1: Paste
  const [hashA, setHashA] = useState("");
  const [hashB, setHashB] = useState("");
  const [pasteResult, setPasteResult] = useState<HashComparisonResult | null>(null);

  // Option 2: Upload Files
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [hashFileA, setHashFileA] = useState<string | null>(null);
  const [hashFileB, setHashFileB] = useState<string | null>(null);
  const [isHashingFileA, setIsHashingFileA] = useState(false);
  const [isHashingFileB, setIsHashingFileB] = useState(false);
  const [fileResult, setFileResult] = useState<HashComparisonResult | null>(null);

  // --- Handlers for Option 1: Paste ---
  const handleComparePaste = () => {
    const errorA = getHashValidationError(hashA, "Hash A");
    if (errorA) {
      setPasteResult({
        type: "invalid_hash",
        message: errorA,
        hashA: hashA.trim(),
        hashB: hashB.trim(),
        isMatch: false,
      });
      return;
    }

    const errorB = getHashValidationError(hashB, "Hash B");
    if (errorB) {
      setPasteResult({
        type: "invalid_hash",
        message: errorB,
        hashA: hashA.trim(),
        hashB: hashB.trim(),
        isMatch: false,
      });
      return;
    }

    const normA = normalizeHash(hashA);
    const normB = normalizeHash(hashB);
    const isMatch = normA === normB;

    setPasteResult({
      type: isMatch ? "match" : "no_match",
      message: isMatch
        ? "Both hashes are bitwise identical."
        : "The two hashes do not match.",
      hashA: normA,
      hashB: normB,
      isMatch,
    });
  };

  const handleClearPaste = () => {
    setHashA("");
    setHashB("");
    setPasteResult(null);
  };

  // --- Handlers for Option 2: Upload Files ---
  const handleSelectFileA = async (files: File[]) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setFileA(file);
    setHashFileA(null);
    setFileResult(null);
    setIsHashingFileA(true);

    try {
      const h = await hashFile(file);
      setHashFileA(h);
      if (hashFileB) {
        evaluateFilesComparison(h, hashFileB);
      }
    } catch {
      setHashFileA("Error hashing file.");
    } finally {
      setIsHashingFileA(false);
    }
  };

  const handleSelectFileB = async (files: File[]) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setFileB(file);
    setHashFileB(null);
    setFileResult(null);
    setIsHashingFileB(true);

    try {
      const h = await hashFile(file);
      setHashFileB(h);
      if (hashFileA) {
        evaluateFilesComparison(hashFileA, h);
      }
    } catch {
      setHashFileB("Error hashing file.");
    } finally {
      setIsHashingFileB(false);
    }
  };

  const evaluateFilesComparison = (hA: string, hB: string) => {
    const comparison = compareHashStrings(hA, hB);
    if (!comparison.isValidA || !comparison.isValidB) {
      setFileResult({
        type: "invalid_hash",
        message: comparison.errorA || comparison.errorB || "Invalid hash generated.",
        hashA: hA,
        hashB: hB,
        isMatch: false,
      });
      return;
    }

    setFileResult({
      type: comparison.isMatch ? "match" : "no_match",
      message: comparison.isMatch
        ? "Both files produce the exact same SHA-256 fingerprint."
        : "File fingerprints do not match.",
      hashA: normalizeHash(hA),
      hashB: normalizeHash(hB),
      isMatch: comparison.isMatch,
    });
  };

  const handleClearFiles = () => {
    setFileA(null);
    setFileB(null);
    setHashFileA(null);
    setHashFileB(null);
    setFileResult(null);
  };

  return (
    <div className="sha256-tab-content">
      <div className="sha256-section-header">
        <div>
          <h2 className="sha256-section-title">Cryptographic Fingerprint Comparison</h2>
          <p className="sha256-section-desc">
            Compare two SHA-256 hashes directly, or upload two files to verify whether their byte contents are bitwise
            identical.
          </p>
        </div>
      </div>

      <div className="sha256-subtab-nav">
        <button
          type="button"
          className={`sha256-subtab-btn ${mode === "paste" ? "sha256-subtab-btn--active" : ""}`}
          onClick={() => setMode("paste")}
        >
          Option 1: Paste Hashes
        </button>
        <button
          type="button"
          className={`sha256-subtab-btn ${mode === "files" ? "sha256-subtab-btn--active" : ""}`}
          onClick={() => setMode("files")}
        >
          Option 2: Upload Files
        </button>
      </div>

      {mode === "paste" ? (
        <div className="sha256-compare-panel">
          <div className="sha256-input-grid">
            <div className="sha256-input-card">
              <label htmlFor="sha256-hash-a" className="sha256-input-label">
                Hash A (Expected or Source Fingerprint)
              </label>
              <textarea
                id="sha256-hash-a"
                className="sha256-hash-textarea"
                rows={3}
                placeholder="e.g. e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
                value={hashA}
                onChange={(e) => {
                  setHashA(e.target.value);
                  setPasteResult(null);
                }}
              />
              <div className="sha256-input-hint">
                {hashA.trim().length > 0 && `${normalizeHash(hashA).length} of 64 hex characters`}
              </div>
            </div>

            <div className="sha256-input-card">
              <label htmlFor="sha256-hash-b" className="sha256-input-label">
                Hash B (Actual or Target Fingerprint)
              </label>
              <textarea
                id="sha256-hash-b"
                className="sha256-hash-textarea"
                rows={3}
                placeholder="e.g. ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
                value={hashB}
                onChange={(e) => {
                  setHashB(e.target.value);
                  setPasteResult(null);
                }}
              />
              <div className="sha256-input-hint">
                {hashB.trim().length > 0 && `${normalizeHash(hashB).length} of 64 hex characters`}
              </div>
            </div>
          </div>

          <div className="sha256-compare-actions">
            <button
              type="button"
              className="bonsai-btn-primary"
              onClick={handleComparePaste}
              disabled={!hashA.trim() || !hashB.trim()}
            >
              Compare Hashes
            </button>
            <button
              type="button"
              className="bonsai-btn-secondary"
              onClick={handleClearPaste}
              disabled={!hashA && !hashB}
            >
              Clear
            </button>
          </div>

          <ComparisonResult result={pasteResult} />
        </div>
      ) : (
        <div className="sha256-compare-panel">
          <div className="sha256-input-grid">
            <div className="sha256-file-target-card">
              <h3 className="sha256-target-heading">File A (Reference File)</h3>
              {fileA ? (
                <div className="sha256-file-brief">
                  <div className="sha256-file-brief__info">
                    <span className="sha256-format-tag">{getFileExtension(fileA.name)}</span>
                    <span className="sha256-filename">{fileA.name}</span>
                    <span className="sha256-filesize">({formatBytes(fileA.size)})</span>
                  </div>
                  {isHashingFileA && <div className="sha256-progress-text">Hashing...</div>}
                  {hashFileA && (
                    <div className="sha256-hash-preview">
                      <code>{hashFileA}</code>
                    </div>
                  )}
                  <button
                    type="button"
                    className="bonsai-btn-secondary sha256-btn-sm"
                    onClick={() => {
                      setFileA(null);
                      setHashFileA(null);
                      setFileResult(null);
                    }}
                  >
                    Replace File A
                  </button>
                </div>
              ) : (
                <FileDropzone
                  multiple={false}
                  title="Drop File A here"
                  subtitle="Any format accepted"
                  onFilesSelected={handleSelectFileA}
                />
              )}
            </div>

            <div className="sha256-file-target-card">
              <h3 className="sha256-target-heading">File B (Comparison File)</h3>
              {fileB ? (
                <div className="sha256-file-brief">
                  <div className="sha256-file-brief__info">
                    <span className="sha256-format-tag">{getFileExtension(fileB.name)}</span>
                    <span className="sha256-filename">{fileB.name}</span>
                    <span className="sha256-filesize">({formatBytes(fileB.size)})</span>
                  </div>
                  {isHashingFileB && <div className="sha256-progress-text">Hashing...</div>}
                  {hashFileB && (
                    <div className="sha256-hash-preview">
                      <code>{hashFileB}</code>
                    </div>
                  )}
                  <button
                    type="button"
                    className="bonsai-btn-secondary sha256-btn-sm"
                    onClick={() => {
                      setFileB(null);
                      setHashFileB(null);
                      setFileResult(null);
                    }}
                  >
                    Replace File B
                  </button>
                </div>
              ) : (
                <FileDropzone
                  multiple={false}
                  title="Drop File B here"
                  subtitle="Any format accepted"
                  onFilesSelected={handleSelectFileB}
                />
              )}
            </div>
          </div>

          {(fileA || fileB) && (
            <div className="sha256-compare-actions">
              <button
                type="button"
                className="bonsai-btn-secondary"
                onClick={handleClearFiles}
              >
                Clear Files
              </button>
            </div>
          )}

          <ComparisonResult result={fileResult} />
        </div>
      )}
    </div>
  );
}
