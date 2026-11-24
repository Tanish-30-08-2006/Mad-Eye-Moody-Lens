import { useMemo, useState } from "react";
import { ManifestVerificationSummary, VerificationStatus } from "../types/sha256.types";
import { formatBytes } from "../utils/file-format";

interface ManifestVerificationResultsProps {
  summary: ManifestVerificationSummary;
}

export function ManifestVerificationResults({ summary }: ManifestVerificationResultsProps) {
  const [filter, setFilter] = useState<VerificationStatus | "ALL">("ALL");

  const filteredItems = useMemo(() => {
    if (filter === "ALL") return summary.items;
    return summary.items.filter((item) => item.status === filter);
  }, [summary, filter]);

  return (
    <div className="sha256-manifest-results">
      <div className="sha256-manifest-stat-grid">
        <div className={`sha256-stat-card ${summary.allMatch ? "sha256-stat-card--success" : ""}`}>
          <div className="sha256-stat-label">Verification Outcome</div>
          <div className="sha256-stat-value">
            {summary.allMatch ? "✓ Integrity Verified" : "Discrepancies Detected"}
          </div>
        </div>

        <div className="sha256-stat-card">
          <div className="sha256-stat-label">Matched (Identical)</div>
          <div className="sha256-stat-value sha256-color-green">{summary.matchedCount}</div>
        </div>

        <div className="sha256-stat-card">
          <div className="sha256-stat-label">Modified (Hash Differs)</div>
          <div className="sha256-stat-value sha256-color-orange">{summary.modifiedCount}</div>
        </div>

        <div className="sha256-stat-card">
          <div className="sha256-stat-label">Missing from Upload</div>
          <div className="sha256-stat-value sha256-color-red">{summary.missingCount}</div>
        </div>

        <div className="sha256-stat-card">
          <div className="sha256-stat-label">Unexpected Files</div>
          <div className="sha256-stat-value sha256-color-blue">{summary.unexpectedCount}</div>
        </div>
      </div>

      <div className="sha256-filter-bar">
        <span className="sha256-filter-label">Filter entries:</span>
        {(["ALL", "MATCHED", "MODIFIED", "MISSING", "UNEXPECTED", "INVALID"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`sha256-filter-pill ${filter === s ? "sha256-filter-pill--active" : ""}`}
            onClick={() => setFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="sha256-table-container">
        <table className="sha256-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Filename</th>
              <th>Expected (Manifest)</th>
              <th>Actual (Uploaded)</th>
              <th>Forensic Findings</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.id} className={`sha256-tr--${item.status.toLowerCase()}`}>
                <td>
                  <span className={`sha256-status-badge sha256-status-badge--${item.status.toLowerCase()}`}>
                    {item.status}
                  </span>
                </td>
                <td className="sha256-table-filename">{item.filename}</td>
                <td>
                  {item.expectedHash ? (
                    <div className="sha256-table-hash">
                      <code>{item.expectedHash.slice(0, 16)}...{item.expectedHash.slice(-8)}</code>
                      <div className="sha256-table-sub">
                        {item.expectedSize !== undefined ? formatBytes(item.expectedSize) : "N/A"}
                      </div>
                    </div>
                  ) : (
                    <span className="sha256-muted">—</span>
                  )}
                </td>
                <td>
                  {item.actualHash ? (
                    <div className="sha256-table-hash">
                      <code>{item.actualHash.slice(0, 16)}...{item.actualHash.slice(-8)}</code>
                      <div className="sha256-table-sub">
                        {item.actualSize !== undefined ? formatBytes(item.actualSize) : "N/A"}
                      </div>
                    </div>
                  ) : (
                    <span className="sha256-muted">Not uploaded</span>
                  )}
                </td>
                <td className="sha256-table-details">{item.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
