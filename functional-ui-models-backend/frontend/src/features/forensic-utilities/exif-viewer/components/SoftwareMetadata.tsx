/**
 * Software and editing metadata section component.
 */

import { useState } from "react";
import { SoftwareInfo } from "../types/metadata.types";
import { copyToClipboard } from "../utils/metadata-export";

interface SoftwareMetadataProps {
  software: SoftwareInfo;
}

export function SoftwareMetadata({ software }: SoftwareMetadataProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (key: string, val: string) => {
    const ok = await copyToClipboard(val);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    }
  };

  const rows = [
    { label: "Software / Firmware", value: software.software },
    { label: "Processing software", value: software.processingSoftware },
    { label: "XMP creator tool", value: software.xmpSoftware },
    { label: "Author / Artist (IPTC)", value: software.iptcCreator },
    { label: "Description (IPTC)", value: software.iptcDescription },
  ];

  const presentRows = rows.filter((r) => r.value !== null && r.value !== undefined && r.value !== "");

  return (
    <div>
      <div className={`exif-notice-box ${software.isEditingSoftwarePresent ? "exif-notice-box--warning" : ""}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>{software.editingSoftwareNotice}</span>
      </div>

      {presentRows.length === 0 ? (
        <div className="exif-empty-section">
          <p>No software or post-processing metadata tags were found in this image.</p>
        </div>
      ) : (
        <div className="exif-table-wrap">
          <table className="exif-table">
            <tbody>
              {presentRows.map((row) => (
                <tr key={row.label}>
                  <td className="exif-table-label">{row.label}</td>
                  <td className="exif-table-value">{row.value}</td>
                  <td className="exif-table-action">
                    <button
                      type="button"
                      className="bonsai-btn-link exif-copy-btn"
                      onClick={() => handleCopy(row.label, String(row.value))}
                      title={`Copy ${row.label}`}
                    >
                      {copiedKey === row.label ? "Copied" : "Copy"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
