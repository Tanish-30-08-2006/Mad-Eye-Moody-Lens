/**
 * Action bar for copying metadata and exporting structured JSON.
 */

import { useState } from "react";
import { CompleteImageMetadata } from "../types/metadata.types";
import { exportMetadataToJson, triggerDownload, copyToClipboard } from "../utils/metadata-export";

interface MetadataExportProps {
  metadata: CompleteImageMetadata;
}

export function MetadataExport({ metadata }: MetadataExportProps) {
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedGps, setCopiedGps] = useState(false);

  const handleCopyJson = async () => {
    const jsonStr = exportMetadataToJson(metadata);
    const ok = await copyToClipboard(jsonStr);
    if (ok) {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    }
  };

  const handleCopyGps = async () => {
    if (!metadata.gps.hasGps || !metadata.gps.gpsData) return;
    const ok = await copyToClipboard(
      `${metadata.gps.gpsData.latitude}, ${metadata.gps.gpsData.longitude}`
    );
    if (ok) {
      setCopiedGps(true);
      setTimeout(() => setCopiedGps(false), 2000);
    }
  };

  const handleDownloadJson = () => {
    const jsonStr = exportMetadataToJson(metadata);
    const baseName = metadata.basic.filename.replace(/\.[^/.]+$/, "");
    const dateStr = new Date().toISOString().slice(0, 10);
    triggerDownload(jsonStr, `${baseName}-exif-metadata-${dateStr}.json`, "application/json");
  };

  return (
    <div className="exif-export-panel">
      <div className="exif-export-text">
        <h4 className="exif-export-title">Export Forensic Metadata</h4>
        <p className="exif-export-desc">
          Copy extracted metadata or download a structured JSON report for evidence archival.
        </p>
      </div>

      <div className="exif-export-actions">
        {metadata.gps.hasGps && (
          <button
            type="button"
            className="bonsai-btn-secondary"
            onClick={handleCopyGps}
            title="Copy GPS coordinates"
          >
            {copiedGps ? "✓ Coordinates Copied" : "Copy GPS Coordinates"}
          </button>
        )}

        <button
          type="button"
          className="bonsai-btn-secondary"
          onClick={handleCopyJson}
          title="Copy formatted metadata JSON to clipboard"
        >
          {copiedJson ? "✓ JSON Copied" : "Copy JSON"}
        </button>

        <button
          type="button"
          className="bonsai-btn-primary"
          onClick={handleDownloadJson}
          title="Download complete forensic metadata report as JSON"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export JSON Report
        </button>
      </div>
    </div>
  );
}
