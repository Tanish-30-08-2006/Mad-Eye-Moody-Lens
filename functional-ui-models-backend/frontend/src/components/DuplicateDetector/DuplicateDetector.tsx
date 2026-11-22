import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ApiError,
  compareDuplicates,
  DuplicateCompareResponse,
} from "../../api/client";
import {
  downloadForensicReport,
  ImageDimension,
} from "./reportGenerator";
import "./DuplicateDetector.css";

interface SelectedImage {
  id: string;
  file: File;
  previewUrl: string;
  error?: string;
}

const MAX_FILES = 20;
const MIN_FILES = 2;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200 MB
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const ALLOWED_MIME_PREFIXES = ["image/jpeg", "image/png", "image/webp"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFormat(file: File): string {
  const ext = file.name.split(".").pop()?.toUpperCase();
  if (ext) return ext;
  if (file.type) return file.type.replace("image/", "").toUpperCase();
  return "IMG";
}

export function DuplicateDetector() {
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DuplicateCompareResponse | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [dimensionsMap, setDimensionsMap] = useState<Map<string, ImageDimension>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  // Create lookup map from filename to preview URL
  const previewMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const img of selectedImages) {
      map.set(img.file.name, img.previewUrl);
    }
    return map;
  }, [selectedImages]);

  // Clean up object URLs on unmount or file changes
  useEffect(() => {
    return () => {
      selectedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  }, [selectedImages]);

  const totalBytes = useMemo(() => {
    return selectedImages.reduce((sum, img) => sum + img.file.size, 0);
  }, [selectedImages]);

  const validImageCount = useMemo(() => {
    return selectedImages.filter((img) => !img.error).length;
  }, [selectedImages]);

  const handleFiles = (incomingFiles: FileList | File[]) => {
    setError(null);
    const newItems: SelectedImage[] = [];
    let currentTotal = totalBytes;

    for (let i = 0; i < incomingFiles.length; i++) {
      const file = incomingFiles[i];

      // Check format
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      const isAllowedExt = ALLOWED_EXTENSIONS.includes(ext);
      const isAllowedMime = ALLOWED_MIME_PREFIXES.includes(file.type);

      let itemError: string | undefined;
      if (!isAllowedExt && !isAllowedMime) {
        itemError = "Unsupported format (only JPG, PNG, WEBP allowed)";
      } else if (file.size > MAX_FILE_SIZE) {
        itemError = `Exceeds 10 MB limit (${formatBytes(file.size)})`;
      } else if (file.size === 0) {
        itemError = "File is empty";
      } else if (currentTotal + file.size > MAX_TOTAL_SIZE) {
        itemError = "Exceeds 200 MB batch limit";
      }

      if (!itemError) {
        currentTotal += file.size;
      }

      newItems.push({
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        error: itemError,
      });
    }

    for (const item of newItems) {
      if (!item.error && typeof Image !== "undefined") {
        const img = new Image();
        img.onload = () => {
          setDimensionsMap((prev) => {
            const next = new Map(prev);
            next.set(item.file.name, { width: img.naturalWidth, height: img.naturalHeight });
            return next;
          });
        };
        img.src = item.previewUrl;
      }
    }

    setSelectedImages((prev) => {
      const combined = [...prev, ...newItems];
      if (combined.length > MAX_FILES) {
        setError(`Maximum of ${MAX_FILES} images allowed. Extras were omitted.`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  };

  const removeImage = (id: string) => {
    setSelectedImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  };

  const clearAll = () => {
    selectedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setSelectedImages([]);
    setResult(null);
    setError(null);
    setProgress(null);
    setReportError(null);
    setIsGeneratingReport(false);
    setDimensionsMap(new Map());
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownloadReport = async () => {
    if (!result || isGeneratingReport) return;
    setIsGeneratingReport(true);
    setReportError(null);

    try {
      await downloadForensicReport({
        result,
        selectedImages,
        dimensionsMap,
      });
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Failed to generate forensic PDF report.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const startComparison = async () => {
    const valid = selectedImages.filter((img) => !img.error);
    if (valid.length < MIN_FILES) {
      setError(`Please select at least ${MIN_FILES} valid images to compare.`);
      return;
    }

    setIsComparing(true);
    setProgress(0);
    setError(null);

    try {
      const res = await compareDuplicates(
        valid.map((img) => img.file),
        (fraction) => setProgress(fraction)
      );
      setResult(res);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred during comparison.");
      }
    } finally {
      setIsComparing(false);
      setProgress(null);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="bonsai-page" id="duplicate-detection">
      <div className="bonsai-container">
        {/* Header Section */}
        <div style={{ marginBottom: "40px" }}>
          <div className="bonsai-tag">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            Forensic Intelligence
          </div>
          <h1 className="bonsai-title">Duplicate Image Detector</h1>
          <p className="bonsai-desc">
            Instantly compare batches of images to detect exact file clones and visually similar variants with mathematical precision.
          </p>
          <div className="bonsai-meta">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>SHA-256 byte hashing &amp; 64-bit perceptual hashing. No persistent database required.</span>
          </div>
        </div>

        {/* Upload Workspace */}
        <div
          className={`bonsai-upload-box ${isDragging ? "is-dragging" : ""}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <input
            id={inputId}
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />

          <svg className="bonsai-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>

          <h2 className="bonsai-upload-title">Upload your images</h2>
          <p className="bonsai-upload-subtitle">
            Drag and drop images here, or browse files directly from your device.
          </p>

          <button
            type="button"
            className="bonsai-btn-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Browse Files
          </button>

          <p className="bonsai-upload-specs">
            Supports JPG, PNG, WEBP · 2 to 20 images · Up to 10 MB per file · Up to 200 MB total
          </p>
        </div>

        {/* Selected Images Section */}
        {selectedImages.length > 0 && (
          <div style={{ marginBottom: "40px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#111827" }}>
                Selected Images ({selectedImages.length}/{MAX_FILES}) ·{" "}
                <span style={{ fontWeight: 400, color: "#6b7280" }}>{formatBytes(totalBytes)}</span>
                {validImageCount < selectedImages.length && (
                  <span style={{ color: "#dc2626", marginLeft: "8px", fontWeight: 500 }}>
                    ({selectedImages.length - validImageCount} invalid)
                  </span>
                )}
              </div>
              <button
                type="button"
                className="bonsai-btn-link"
                onClick={clearAll}
                disabled={isComparing}
              >
                Clear all
              </button>
            </div>

            {/* Previews Grid */}
            <div className="bonsai-files-grid">
              {selectedImages.map((img) => (
                <div key={img.id} className={`bonsai-file-card ${img.error ? "has-error" : ""}`}>
                  <div className="bonsai-thumb-wrap">
                    <img src={img.previewUrl} alt={img.file.name} className="bonsai-thumb" />
                  </div>
                  <div className="bonsai-file-info">
                    <div className="bonsai-file-name" title={img.file.name}>
                      {img.file.name}
                    </div>
                    <div className="bonsai-file-meta">
                      <span className="bonsai-format-chip">{getFormat(img.file)}</span>
                      <span>{formatBytes(img.file.size)}</span>
                    </div>
                    {img.error && (
                      <div style={{ color: "#dc2626", fontSize: "0.6875rem", marginTop: "4px", fontWeight: 500 }}>
                        {img.error}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="bonsai-remove-btn"
                    onClick={() => removeImage(img.id)}
                    disabled={isComparing}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Action Bar */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "24px" }}>
              <button
                type="button"
                className="bonsai-btn-primary"
                onClick={startComparison}
                disabled={validImageCount < MIN_FILES || isComparing}
                style={{ minWidth: "180px" }}
              >
                {isComparing
                  ? progress !== null && progress > 0
                    ? `Uploading (${Math.round(progress * 100)}%)...`
                    : "Comparing Images..."
                  : `Compare ${validImageCount} Images`}
              </button>

              {validImageCount < MIN_FILES && (
                <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                  Select at least {MIN_FILES} valid images to start comparison.
                </span>
              )}
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="bonsai-error-banner">
            <div>
              <strong>Error:</strong> {error}
            </div>
            <button
              type="button"
              className="bonsai-btn-secondary"
              onClick={startComparison}
              style={{ padding: "4px 14px", fontSize: "0.8125rem" }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Results Container */}
        {result && (
          <div style={{ marginTop: "48px" }}>
            {/* Header with Download Report & Clear buttons */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              <div>
                <h2 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#000000", margin: "0 0 4px 0", letterSpacing: "-0.02em" }}>
                  Comparison Summary
                </h2>
                <p style={{ fontSize: "0.9375rem", color: "#6b7280", margin: 0 }}>
                  Real-time batch forensic report derived from {result.summary.total_images} uploaded files.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  type="button"
                  id="download-forensic-report-btn"
                  className="bonsai-btn-primary"
                  onClick={handleDownloadReport}
                  disabled={isGeneratingReport}
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 18px" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {isGeneratingReport ? "Generating Report..." : "Download Forensic Report"}
                </button>
                <button
                  type="button"
                  className="bonsai-btn-secondary"
                  onClick={() => setResult(null)}
                >
                  Clear Results
                </button>
              </div>
            </div>

            {/* Report Generation Error Banner */}
            {reportError && (
              <div className="bonsai-error-banner" style={{ marginBottom: "20px" }}>
                <div>
                  <strong>Report Error:</strong> {reportError}
                </div>
                <button
                  type="button"
                  className="bonsai-btn-secondary"
                  onClick={handleDownloadReport}
                  style={{ padding: "4px 14px", fontSize: "0.8125rem" }}
                >
                  Retry Download
                </button>
              </div>
            )}

            {/* 8 Clean Metric Cards (Reference 2 Styling) */}
            <div className="bonsai-summary-grid">
              {/* 1. Total Images */}
              <div className="bonsai-summary-card">
                <svg className="bonsai-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <div className="bonsai-card-val">{result.summary.total_images}</div>
                <div className="bonsai-card-label">Total Uploaded</div>
                <p className="bonsai-card-desc">Total files provided in current batch</p>
              </div>

              {/* 2. Valid Images */}
              <div className="bonsai-summary-card">
                <svg className="bonsai-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <div className="bonsai-card-val">{result.summary.valid_images}</div>
                <div className="bonsai-card-label">Valid Images</div>
                <p className="bonsai-card-desc">Decoded and verified successfully</p>
              </div>

              {/* 3. Failed Images */}
              <div className="bonsai-summary-card">
                <svg className="bonsai-card-icon" viewBox="0 0 24 24" fill="none" stroke={result.summary.failed_images > 0 ? "#dc2626" : "currentColor"}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div className="bonsai-card-val" style={{ color: result.summary.failed_images > 0 ? "#dc2626" : "#000000" }}>
                  {result.summary.failed_images}
                </div>
                <div className="bonsai-card-label">Failed Files</div>
                <p className="bonsai-card-desc">Oversized, corrupted, or unsupported</p>
              </div>

              {/* 4. Total Comparisons */}
              <div className="bonsai-summary-card">
                <svg className="bonsai-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <div className="bonsai-card-val">{result.summary.total_comparisons}</div>
                <div className="bonsai-card-label">Total Comparisons</div>
                <p className="bonsai-card-desc">Pairwise comparisons computed</p>
              </div>

              {/* 5. Exact Duplicate Groups */}
              <div className="bonsai-summary-card">
                <svg className="bonsai-card-icon" viewBox="0 0 24 24" fill="none" stroke={result.summary.exact_duplicate_groups > 0 ? "#059669" : "currentColor"}>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <div className="bonsai-card-val" style={{ color: result.summary.exact_duplicate_groups > 0 ? "#059669" : "#000000" }}>
                  {result.summary.exact_duplicate_groups}
                </div>
                <div className="bonsai-card-label">Exact Groups</div>
                <p className="bonsai-card-desc">Identical SHA-256 byte fingerprints</p>
              </div>

              {/* 6. Very Similar */}
              <div className="bonsai-summary-card">
                <svg className="bonsai-card-icon" viewBox="0 0 24 24" fill="none" stroke={result.summary.very_similar_pairs > 0 ? "#d97706" : "currentColor"}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <div className="bonsai-card-val" style={{ color: result.summary.very_similar_pairs > 0 ? "#d97706" : "#000000" }}>
                  {result.summary.very_similar_pairs}
                </div>
                <div className="bonsai-card-label">Very Similar</div>
                <p className="bonsai-card-desc">Hamming distance 0 to 5 bits</p>
              </div>

              {/* 7. Potential Matches */}
              <div className="bonsai-summary-card">
                <svg className="bonsai-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <div className="bonsai-card-val">{result.summary.potentially_similar_pairs}</div>
                <div className="bonsai-card-label">Potential Matches</div>
                <p className="bonsai-card-desc">Hamming distance 6 to 10 bits</p>
              </div>

              {/* 8. No Matches */}
              <div className="bonsai-summary-card">
                <svg className="bonsai-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <div className="bonsai-card-val">{result.summary.no_match_pairs}</div>
                <div className="bonsai-card-label">No Strong Match</div>
                <p className="bonsai-card-desc">Hamming distance above 10 bits</p>
              </div>
            </div>

            {/* SECTION 1: EXACT DUPLICATES */}
            <div className="bonsai-section">
              <div className="bonsai-section-header">
                <div>
                  <h3 className="bonsai-section-title">Exact Duplicates</h3>
                  <p className="bonsai-section-subtitle">
                    Identical file bytes confirmed by cryptographic SHA-256 hash comparison.
                  </p>
                </div>
                {result.exact_duplicate_groups.length > 0 && (
                  <span className="bonsai-badge-success">
                    {result.summary.exact_duplicate_groups} Group{result.summary.exact_duplicate_groups !== 1 ? "s" : ""} Found
                  </span>
                )}
              </div>

              {result.exact_duplicate_groups.length === 0 ? (
                <div className="bonsai-empty-state">
                  No byte-for-byte exact duplicate files were detected in this batch.
                </div>
              ) : (
                result.exact_duplicate_groups.map((group, gIdx) => (
                  <div key={group.group_id} className="bonsai-group-card">
                    <div className="bonsai-group-header">
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span className="bonsai-badge-success">✓ Exact Match</span>
                        <strong style={{ fontSize: "0.9375rem", color: "#111827" }}>
                          Group {gIdx + 1} ({group.count} files)
                        </strong>
                      </div>
                      <div className="bonsai-hash-chip" title={group.sha256}>
                        SHA-256: {group.sha256}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "16px" }}>
                      {group.files.map((fname) => {
                        const thumb = previewMap.get(fname);
                        return (
                          <div
                            key={fname}
                            style={{
                              background: "#ffffff",
                              border: "1px solid #e5e7eb",
                              borderRadius: "10px",
                              overflow: "hidden",
                            }}
                          >
                            <div style={{ width: "100%", height: "120px", background: "#f3f4f6" }}>
                              {thumb ? (
                                <img src={thumb} alt={fname} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : null}
                            </div>
                            <div style={{ padding: "10px", fontSize: "0.8125rem", fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={fname}>
                              {fname}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* SECTION 2: VISUALLY SIMILAR IMAGES */}
            <div className="bonsai-section">
              <div className="bonsai-section-header">
                <div>
                  <h3 className="bonsai-section-title">Visually Similar Images</h3>
                  <p className="bonsai-section-subtitle">
                    Images sharing visual structure evaluated via 64-bit perceptual hashing (pHash).
                  </p>
                </div>
                {result.similar_matches.length > 0 && (
                  <span className="bonsai-badge-warn">
                    {result.similar_matches.length} Matched Pair{result.similar_matches.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {result.similar_matches.length === 0 ? (
                <div className="bonsai-empty-state">
                  No visually similar image pairs were detected within the similarity threshold (distance ≤ 10).
                </div>
              ) : (
                result.similar_matches.map((match, idx) => {
                  const thumbA = previewMap.get(match.file_a);
                  const thumbB = previewMap.get(match.file_b);
                  const isVerySimilar = match.classification === "very_similar";

                  return (
                    <div key={`${match.file_a}-${match.file_b}-${idx}`} className="bonsai-pair-card">
                      {/* Left: Previews */}
                      <div className="bonsai-pair-previews">
                        <div className="bonsai-pair-item">
                          <div className="bonsai-pair-img-wrap">
                            {thumbA && <img src={thumbA} alt={match.file_a} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                          </div>
                          <span className="bonsai-pair-name" title={match.file_a}>{match.file_a}</span>
                        </div>

                        <span className="bonsai-vs-pill">VS</span>

                        <div className="bonsai-pair-item">
                          <div className="bonsai-pair-img-wrap">
                            {thumbB && <img src={thumbB} alt={match.file_b} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                          </div>
                          <span className="bonsai-pair-name" title={match.file_b}>{match.file_b}</span>
                        </div>
                      </div>

                      {/* Right: Metrics */}
                      <div className="bonsai-pair-metrics">
                        <div style={{ textAlign: "right" }}>
                          <div className="bonsai-sim-val">{match.similarity_percent.toFixed(2)}%</div>
                          <div style={{ fontSize: "0.8125rem", color: "#6b7280" }}>
                            Hamming: <strong>{match.hamming_distance}</strong> / 64 bits
                          </div>
                        </div>

                        <span className={isVerySimilar ? "bonsai-badge-warn" : "bonsai-badge-neutral"}>
                          {isVerySimilar ? "Very Similar" : "Potentially Similar"}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}

              <p style={{ fontSize: "0.8125rem", color: "#6b7280", marginTop: "16px", marginBottom: 0 }}>
                * Perceptual similarity measures geometric and frequency distribution. It does not establish common origin or forensic authenticity.
              </p>
            </div>

            {/* SECTION 3: NO STRONG MATCHES */}
            <div className="bonsai-section">
              <div className="bonsai-section-header">
                <div>
                  <h3 className="bonsai-section-title">No Strong Matches</h3>
                  <p className="bonsai-section-subtitle">
                    Image pairs that did not meet the configured perceptual similarity threshold (distance &gt; 10).
                  </p>
                </div>
              </div>

              {result.no_strong_matches.length === 0 ? (
                <div className="bonsai-empty-state">
                  No exact duplicates or strong perceptual matches were detected in this batch.
                </div>
              ) : (
                <div className="bonsai-table-wrap">
                  <table className="bonsai-table">
                    <thead>
                      <tr>
                        <th>Image Pair</th>
                        <th>Hamming Distance</th>
                        <th>Bit Similarity</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.no_strong_matches.map((pair, idx) => (
                        <tr key={`${pair.file_a}-${pair.file_b}-${idx}`}>
                          <td style={{ fontWeight: 600, color: "#111827" }}>
                            {pair.file_a} <span style={{ color: "#9ca3af", fontWeight: 400 }}>vs</span> {pair.file_b}
                          </td>
                          <td>{pair.hamming_distance} / 64 bits</td>
                          <td>{pair.similarity_percent.toFixed(2)}%</td>
                          <td style={{ color: "#6b7280" }}>No Strong Match</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* FAILED FILES (IF ANY) */}
            {result.failed_files.length > 0 && (
              <div className="bonsai-section" style={{ borderColor: "#fecaca" }}>
                <h3 className="bonsai-section-title" style={{ color: "#dc2626" }}>
                  Failed Files ({result.failed_files.length})
                </h3>
                <p className="bonsai-section-subtitle" style={{ marginBottom: "16px" }}>
                  The following files were excluded from comparison due to validation errors.
                </p>
                <div style={{ background: "#fef2f2", border: "1px solid #fee2e2", borderRadius: "10px", padding: "16px" }}>
                  <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "0.875rem", color: "#991b1b" }}>
                    {result.failed_files.map((ff, idx) => (
                      <li key={idx} style={{ marginBottom: "6px" }}>
                        <strong>{ff.filename}</strong>: {ff.error}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Privacy Notice Banner */}
            <div className="bonsai-privacy-box">
              <svg className="bonsai-privacy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <p className="bonsai-privacy-text">
                <strong>Privacy Assurance:</strong> Uploaded images are processed entirely in-memory for this comparison session only. No persistent image files, hashes, or analytical records are stored in any database. All temporary byte buffers are cleared immediately upon request completion.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
