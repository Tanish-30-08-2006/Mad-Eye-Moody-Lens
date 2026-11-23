import { useMemo } from "react";
import { useSha256 } from "../hooks/useSha256";
import { exportHashesToCsv, exportHashesToJson, formatBytes, triggerDownload } from "../utils/file-format";
import { FileDropzone } from "./FileDropzone";
import { HashResultCard } from "./HashResultCard";

export function GenerateTab() {
  const { files, isProcessing, addFiles, removeFile, clearFiles, hashSingle, hashAll, cancel } = useSha256();

  const completedFiles = useMemo(
    () =>
      files
        .filter((f) => f.status === "done" && f.hash)
        .map((f) => ({
          filename: f.file.name,
          size: f.file.size,
          hash: f.hash!,
        })),
    [files]
  );

  const totalSize = useMemo(() => files.reduce((acc, f) => acc + f.file.size, 0), [files]);

  const handleExportCsv = () => {
    if (completedFiles.length === 0) return;
    const csv = exportHashesToCsv(completedFiles);
    const dateStr = new Date().toISOString().slice(0, 10);
    triggerDownload(csv, `sha256-manifest-${dateStr}.csv`, "text/csv");
  };

  const handleExportJson = () => {
    if (completedFiles.length === 0) return;
    const json = exportHashesToJson(completedFiles);
    const dateStr = new Date().toISOString().slice(0, 10);
    triggerDownload(json, `sha256-manifest-${dateStr}.json`, "application/json");
  };

  return (
    <div className="sha256-tab-content">
      <div className="sha256-section-header">
        <div>
          <h2 className="sha256-section-title">Batch Hash Generation</h2>
          <p className="sha256-section-desc">
            Select one or multiple files of any type. Hashes are computed locally in your browser using the standard
            SHA-256 algorithm.
          </p>
        </div>
      </div>

      <FileDropzone onFilesSelected={addFiles} disabled={isProcessing} />

      {files.length > 0 && (
        <div className="sha256-batch-panel">
          <div className="sha256-batch-summary">
            <strong>{files.length}</strong> {files.length === 1 ? "file" : "files"} queued ({formatBytes(totalSize)})
            {" · "}
            <span className="sha256-summary-done">
              {completedFiles.length} of {files.length} hashed
            </span>
          </div>

          <div className="sha256-batch-actions">
            {isProcessing ? (
              <button type="button" className="bonsai-btn-secondary" onClick={cancel}>
                Cancel Processing
              </button>
            ) : (
              <button
                type="button"
                className="bonsai-btn-primary"
                onClick={hashAll}
                disabled={files.every((f) => f.status === "done")}
              >
                Generate All Hashes
              </button>
            )}

            <button
              type="button"
              className="bonsai-btn-secondary"
              onClick={handleExportCsv}
              disabled={completedFiles.length === 0 || isProcessing}
              title="Download CSV report of generated hashes"
            >
              Export CSV
            </button>

            <button
              type="button"
              className="bonsai-btn-secondary"
              onClick={handleExportJson}
              disabled={completedFiles.length === 0 || isProcessing}
              title="Download JSON manifest of generated hashes"
            >
              Export JSON
            </button>

            <button
              type="button"
              className="bonsai-btn-secondary sha256-btn-danger"
              onClick={clearFiles}
              disabled={isProcessing}
            >
              Clear All
            </button>
          </div>

          <div className="sha256-results-list">
            {files.map((item) => (
              <HashResultCard
                key={item.id}
                item={item}
                onRemove={removeFile}
                onHashSingle={hashSingle}
                disabled={isProcessing}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
