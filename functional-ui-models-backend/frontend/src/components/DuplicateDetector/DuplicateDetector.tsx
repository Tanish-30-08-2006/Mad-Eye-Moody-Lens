import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ApiError,
  compareDuplicates,
  DuplicateCompareResponse,
} from "../../api/client";

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
        itemError = "Adding this file exceeds 200 MB batch limit";
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
    if (fileInputRef.current) fileInputRef.current.value = "";
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
    <section className="analyser-section" id="duplicate-detection" style={{ paddingTop: "2rem", paddingBottom: "4rem" }}>
      <div className="container">
        {/* Header */}
        <div style={{ marginBottom: "2rem", borderBottom: "1px solid var(--border)", paddingBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                padding: "2px 8px",
                border: "1px solid var(--border)",
                borderRadius: "3px",
              }}
            >
              Batch Forensic Tool
            </span>
          </div>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: "2.25rem", margin: "0 0 0.5rem 0", fontWeight: 400 }}>
            Duplicate Image Detector
          </h1>
          <p style={{ color: "var(--ink-secondary)", fontSize: "1.05rem", maxWidth: "48rem", margin: "0 0 0.5rem 0" }}>
            Identify exact duplicates and visually similar images within an uploaded batch.
          </p>
          <p style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", color: "var(--ink-muted)", margin: 0 }}>
            Uses SHA-256 byte fingerprints and 64-bit perceptual hashing (pHash). No persistent hash database is required.
          </p>
        </div>

        {/* Upload Interface */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          style={{
            border: isDragging ? "2px dashed var(--ink)" : "1px dashed var(--border)",
            background: isDragging ? "var(--accent-subtle, rgba(255,255,255,0.03))" : "var(--bg-card, rgba(255,255,255,0.01))",
            padding: "2.5rem 1.5rem",
            textAlign: "center",
            borderRadius: "6px",
            marginBottom: "1.5rem",
            transition: "border-color 0.15s, background-color 0.15s",
          }}
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

          <div style={{ marginBottom: "1rem" }}>
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.6 }}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>

          <p style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem" }}>
            Drag and drop images here, or{" "}
            <label
              htmlFor={inputId}
              style={{
                color: "var(--ink)",
                textDecoration: "underline",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              browse files
            </label>
          </p>

          <p style={{ fontFamily: "var(--mono)", fontSize: "0.8rem", color: "var(--ink-muted)", margin: 0 }}>
            2 to 20 images · Up to 10 MB per file · Up to 200 MB total · JPG, JPEG, PNG, WEBP (mixed formats allowed)
          </p>
        </div>

        {/* Selected Images Grid */}
        {selectedImages.length > 0 && (
          <div style={{ marginBottom: "2rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
                fontFamily: "var(--mono)",
                fontSize: "0.85rem",
              }}
            >
              <div>
                Selected: <strong>{selectedImages.length}</strong> / {MAX_FILES} images ({formatBytes(totalBytes)})
                {validImageCount < selectedImages.length && (
                  <span style={{ color: "var(--red, #e53e3e)", marginLeft: "0.75rem" }}>
                    ({selectedImages.length - validImageCount} invalid)
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={clearAll}
                disabled={isComparing}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--ink-secondary)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "inherit",
                  textDecoration: "underline",
                }}
              >
                Clear all
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "1rem",
                maxHeight: "360px",
                overflowY: "auto",
                padding: "0.5rem",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                background: "rgba(0,0,0,0.15)",
              }}
            >
              {selectedImages.map((img) => (
                <div
                  key={img.id}
                  style={{
                    position: "relative",
                    border: img.error ? "1px solid var(--red, #e53e3e)" : "1px solid var(--border)",
                    borderRadius: "4px",
                    overflow: "hidden",
                    background: "var(--bg-card, #121212)",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div style={{ height: "110px", width: "100%", overflow: "hidden", background: "#050505" }}>
                    <img
                      src={img.previewUrl}
                      alt={img.file.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                  <div style={{ padding: "0.5rem", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontFamily: "var(--mono)",
                        wordBreak: "break-all",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginBottom: "0.25rem",
                      }}
                      title={img.file.name}
                    >
                      {img.file.name}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.7rem",
                        color: "var(--ink-muted)",
                        fontFamily: "var(--mono)",
                      }}
                    >
                      <span style={{ padding: "1px 4px", border: "1px solid var(--border)", borderRadius: "2px" }}>
                        {getFormat(img.file)}
                      </span>
                      <span>{formatBytes(img.file.size)}</span>
                    </div>
                    {img.error && (
                      <div style={{ color: "var(--red, #e53e3e)", fontSize: "0.68rem", marginTop: "0.25rem" }}>
                        {img.error}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeImage(img.id)}
                    disabled={isComparing}
                    style={{
                      position: "absolute",
                      top: "4px",
                      right: "4px",
                      background: "rgba(0,0,0,0.7)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "50%",
                      width: "22px",
                      height: "22px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                    }}
                    title="Remove image"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Action Bar */}
            <div style={{ marginTop: "1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}>
              <button
                type="button"
                className="btn btn--primary"
                onClick={startComparison}
                disabled={validImageCount < MIN_FILES || isComparing}
                style={{
                  padding: "0.75rem 2rem",
                  fontFamily: "var(--mono)",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  letterSpacing: "0.05em",
                  cursor: validImageCount >= MIN_FILES && !isComparing ? "pointer" : "not-allowed",
                  opacity: validImageCount >= MIN_FILES && !isComparing ? 1 : 0.5,
                }}
              >
                {isComparing
                  ? progress !== null && progress > 0
                    ? `Uploading (${Math.round(progress * 100)}%)...`
                    : "Comparing Images..."
                  : `Compare ${validImageCount} Images`}
              </button>

              {validImageCount < MIN_FILES && (
                <span style={{ fontSize: "0.85rem", color: "var(--ink-secondary)", fontFamily: "var(--mono)" }}>
                  Select at least {MIN_FILES} valid images to enable comparison.
                </span>
              )}
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div
            style={{
              padding: "1rem",
              background: "rgba(229, 62, 62, 0.1)",
              border: "1px solid var(--red, #e53e3e)",
              borderRadius: "4px",
              color: "var(--red, #e53e3e)",
              marginBottom: "1.5rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontFamily: "var(--mono)",
              fontSize: "0.9rem",
            }}
          >
            <div>
              <strong>Error:</strong> {error}
            </div>
            <button
              type="button"
              onClick={startComparison}
              style={{
                background: "transparent",
                border: "1px solid var(--red, #e53e3e)",
                color: "var(--red, #e53e3e)",
                padding: "4px 12px",
                borderRadius: "3px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Results Container */}
        {result && (
          <div style={{ marginTop: "3rem" }}>
            {/* Top Summary Bar */}
            <div
              style={{
                background: "var(--bg-card, #141414)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "1.5rem",
                marginBottom: "2.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: "1rem",
                  marginBottom: "1rem",
                }}
              >
                <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.5rem", margin: 0, fontWeight: 400 }}>
                  Batch Comparison Summary
                </h2>
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--ink)",
                    padding: "4px 10px",
                    borderRadius: "3px",
                    cursor: "pointer",
                    fontFamily: "var(--mono)",
                    fontSize: "0.75rem",
                  }}
                >
                  Clear Results
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: "1rem",
                  textAlign: "center",
                  fontFamily: "var(--mono)",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", textTransform: "uppercase" }}>Total Uploaded</div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{result.summary.total_images}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", textTransform: "uppercase" }}>Valid Images</div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{result.summary.valid_images}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", textTransform: "uppercase" }}>Failed Files</div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 700, color: result.summary.failed_images > 0 ? "var(--red, #e53e3e)" : "inherit" }}>
                    {result.summary.failed_images}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", textTransform: "uppercase" }}>Comparisons</div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{result.summary.total_comparisons}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", textTransform: "uppercase" }}>Exact Groups</div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 700, color: result.summary.exact_duplicate_groups > 0 ? "var(--green, #48bb78)" : "inherit" }}>
                    {result.summary.exact_duplicate_groups}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", textTransform: "uppercase" }}>Very Similar</div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 700, color: result.summary.very_similar_pairs > 0 ? "var(--amber, #ecc94b)" : "inherit" }}>
                    {result.summary.very_similar_pairs}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", textTransform: "uppercase" }}>Potential Matches</div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{result.summary.potentially_similar_pairs}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", textTransform: "uppercase" }}>No Match</div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--ink-muted)" }}>{result.summary.no_match_pairs}</div>
                </div>
              </div>
            </div>

            {/* SECTION 1: EXACT DUPLICATES */}
            <div style={{ marginBottom: "3rem" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "1rem" }}>
                <h3 style={{ fontFamily: "var(--serif)", fontSize: "1.4rem", margin: 0, fontWeight: 400 }}>
                  Section 1 · Exact Duplicates (SHA-256)
                </h3>
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.8rem", color: "var(--ink-muted)" }}>
                  Byte-for-byte identical files
                </span>
              </div>

              {result.exact_duplicate_groups.length === 0 ? (
                <div
                  style={{
                    padding: "1.5rem",
                    border: "1px solid var(--border)",
                    borderRadius: "4px",
                    color: "var(--ink-secondary)",
                    fontFamily: "var(--mono)",
                    fontSize: "0.85rem",
                  }}
                >
                  No exact byte-for-byte duplicates were detected in this batch.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  {result.exact_duplicate_groups.map((group, gIdx) => (
                    <div
                      key={group.group_id}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        padding: "1.25rem",
                        background: "var(--bg-card, #121212)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "1rem",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                          paddingBottom: "0.75rem",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <span
                            style={{
                              background: "rgba(72, 187, 120, 0.15)",
                              color: "var(--green, #48bb78)",
                              border: "1px solid rgba(72, 187, 120, 0.4)",
                              padding: "2px 8px",
                              borderRadius: "3px",
                              fontFamily: "var(--mono)",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                            }}
                          >
                            Exact Match
                          </span>
                          <strong style={{ fontFamily: "var(--mono)", fontSize: "0.9rem" }}>
                            Group {gIdx + 1} ({group.count} files)
                          </strong>
                        </div>
                        <span
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: "0.72rem",
                            color: "var(--ink-muted)",
                            maxWidth: "320px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={`SHA-256: ${group.sha256}`}
                        >
                          SHA-256: {group.sha256}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                          gap: "1rem",
                        }}
                      >
                        {group.files.map((fname) => {
                          const thumb = previewMap.get(fname);
                          return (
                            <div
                              key={fname}
                              style={{
                                border: "1px solid var(--border)",
                                borderRadius: "4px",
                                overflow: "hidden",
                                background: "#050505",
                              }}
                            >
                              {thumb ? (
                                <div style={{ height: "100px", width: "100%", overflow: "hidden" }}>
                                  <img src={thumb} alt={fname} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                </div>
                              ) : (
                                <div style={{ height: "100px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-muted)" }}>
                                  Preview unavailable
                                </div>
                              )}
                              <div
                                style={{
                                  padding: "0.5rem",
                                  fontSize: "0.75rem",
                                  fontFamily: "var(--mono)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={fname}
                              >
                                {fname}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SECTION 2: VISUALLY SIMILAR IMAGES */}
            <div style={{ marginBottom: "3rem" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "0.5rem" }}>
                <h3 style={{ fontFamily: "var(--serif)", fontSize: "1.4rem", margin: 0, fontWeight: 400 }}>
                  Section 2 · Visually Similar Images (Perceptual Hash)
                </h3>
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.8rem", color: "var(--ink-muted)" }}>
                  Hamming distance ≤ 10 / 64 bits
                </span>
              </div>
              <p style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", color: "var(--ink-muted)", margin: "0 0 1rem 0" }}>
                Mathematical hash similarity percentage: (1 - Hamming Distance / 64) * 100. Not forensic proof of authenticity.
              </p>

              {result.similar_matches.length === 0 ? (
                <div
                  style={{
                    padding: "1.5rem",
                    border: "1px solid var(--border)",
                    borderRadius: "4px",
                    color: "var(--ink-secondary)",
                    fontFamily: "var(--mono)",
                    fontSize: "0.85rem",
                  }}
                >
                  No visually similar image pairs were detected within the similarity threshold.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {result.similar_matches.map((match, idx) => {
                    const thumbA = previewMap.get(match.file_a);
                    const thumbB = previewMap.get(match.file_b);
                    const isVerySimilar = match.classification === "very_similar";

                    return (
                      <div
                        key={`${match.file_a}-${match.file_b}-${idx}`}
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          padding: "1rem 1.25rem",
                          background: "var(--bg-card, #121212)",
                          display: "flex",
                          flexWrap: "wrap",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "1rem",
                        }}
                      >
                        {/* Side by side image previews */}
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "110px" }}>
                            <div style={{ width: "90px", height: "70px", borderRadius: "3px", overflow: "hidden", background: "#050505", border: "1px solid var(--border)" }}>
                              {thumbA ? (
                                <img src={thumbA} alt={match.file_a} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : null}
                            </div>
                            <span
                              style={{
                                fontSize: "0.72rem",
                                fontFamily: "var(--mono)",
                                maxWidth: "100px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                marginTop: "0.25rem",
                              }}
                              title={match.file_a}
                            >
                              {match.file_a}
                            </span>
                          </div>

                          <span style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", color: "var(--ink-muted)" }}>vs</span>

                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "110px" }}>
                            <div style={{ width: "90px", height: "70px", borderRadius: "3px", overflow: "hidden", background: "#050505", border: "1px solid var(--border)" }}>
                              {thumbB ? (
                                <img src={thumbB} alt={match.file_b} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : null}
                            </div>
                            <span
                              style={{
                                fontSize: "0.72rem",
                                fontFamily: "var(--mono)",
                                maxWidth: "100px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                marginTop: "0.25rem",
                              }}
                              title={match.file_b}
                            >
                              {match.file_b}
                            </span>
                          </div>
                        </div>

                        {/* Match metrics */}
                        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", fontFamily: "var(--mono)" }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)" }}>
                              Hamming: <strong>{match.hamming_distance}</strong> / 64
                            </div>
                            <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                              {match.similarity_percent.toFixed(2)}%
                            </div>
                          </div>

                          <span
                            style={{
                              background: isVerySimilar ? "rgba(236, 201, 75, 0.15)" : "rgba(255, 255, 255, 0.08)",
                              color: isVerySimilar ? "var(--amber, #ecc94b)" : "var(--ink-secondary)",
                              border: isVerySimilar ? "1px solid rgba(236, 201, 75, 0.4)" : "1px solid var(--border)",
                              padding: "4px 10px",
                              borderRadius: "4px",
                              fontSize: "0.78rem",
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            {isVerySimilar ? "Very Similar" : "Potentially Similar"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SECTION 3: NO STRONG MATCHES */}
            <div style={{ marginBottom: "3rem" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "1rem" }}>
                <h3 style={{ fontFamily: "var(--serif)", fontSize: "1.4rem", margin: 0, fontWeight: 400 }}>
                  Section 3 · No Strong Matches
                </h3>
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.8rem", color: "var(--ink-muted)" }}>
                  Hamming distance &gt; 10 / 64 bits
                </span>
              </div>

              {result.no_strong_matches.length === 0 ? (
                <div
                  style={{
                    padding: "1.5rem",
                    border: "1px solid var(--border)",
                    borderRadius: "4px",
                    color: "var(--ink-secondary)",
                    fontFamily: "var(--mono)",
                    fontSize: "0.85rem",
                  }}
                >
                  No exact duplicates or strong perceptual matches were detected in this batch.
                </div>
              ) : (
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "1rem",
                    background: "var(--bg-card, #121212)",
                    maxHeight: "260px",
                    overflowY: "auto",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--mono)", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--ink-muted)" }}>
                        <th style={{ padding: "0.5rem" }}>Image Pair</th>
                        <th style={{ padding: "0.5rem" }}>Hamming Distance</th>
                        <th style={{ padding: "0.5rem" }}>Similarity</th>
                        <th style={{ padding: "0.5rem" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.no_strong_matches.map((pair, idx) => (
                        <tr key={`${pair.file_a}-${pair.file_b}-${idx}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding: "0.5rem" }}>
                            {pair.file_a} <span style={{ color: "var(--ink-muted)" }}>vs</span> {pair.file_b}
                          </td>
                          <td style={{ padding: "0.5rem" }}>{pair.hamming_distance} / 64</td>
                          <td style={{ padding: "0.5rem" }}>{pair.similarity_percent.toFixed(2)}%</td>
                          <td style={{ padding: "0.5rem", color: "var(--ink-muted)" }}>No Strong Match</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* FAILED FILES (IF ANY) */}
            {result.failed_files.length > 0 && (
              <div style={{ marginBottom: "3rem" }}>
                <h3 style={{ fontFamily: "var(--serif)", fontSize: "1.4rem", margin: "0 0 1rem 0", fontWeight: 400, color: "var(--red, #e53e3e)" }}>
                  Failed Files ({result.failed_files.length})
                </h3>
                <div style={{ border: "1px solid var(--red, #e53e3e)", borderRadius: "6px", padding: "1rem", background: "rgba(229, 62, 62, 0.05)" }}>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", fontFamily: "var(--mono)", fontSize: "0.85rem" }}>
                    {result.failed_files.map((ff, idx) => (
                      <li key={idx} style={{ marginBottom: "0.25rem" }}>
                        <strong>{ff.filename}</strong>: {ff.error}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Privacy Explanation */}
            <div
              style={{
                padding: "1rem 1.25rem",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                background: "rgba(255,255,255,0.02)",
                fontFamily: "var(--mono)",
                fontSize: "0.78rem",
                color: "var(--ink-muted)",
                lineHeight: 1.5,
              }}
            >
              <strong>Privacy Notice:</strong> Images are processed in memory for this comparison only. No persistent image or hash database is used. All temporary buffers are cleared immediately after comparison.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
