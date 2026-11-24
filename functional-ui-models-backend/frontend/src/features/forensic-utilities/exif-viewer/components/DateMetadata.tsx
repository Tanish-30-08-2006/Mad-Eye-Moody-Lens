/**
 * Date and time metadata section component.
 */

import { useState } from "react";
import { DateTimeInfo } from "../types/metadata.types";
import { copyToClipboard } from "../utils/metadata-export";

interface DateMetadataProps {
  dateTime: DateTimeInfo;
}

export function DateMetadata({ dateTime }: DateMetadataProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (key: string, val: string) => {
    const ok = await copyToClipboard(val);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    }
  };

  const rows = [
    { label: "Capture date (DateTimeOriginal)", value: dateTime.dateTimeOriginal },
    { label: "Digitized date (DateTimeDigitized)", value: dateTime.dateTimeDigitized },
    { label: "Modification date (ModifyDate)", value: dateTime.modifyDate },
    { label: "Sub-second fractional time", value: dateTime.subSecTimeOriginal },
    { label: "Timezone offset", value: dateTime.offsetTimeOriginal || (dateTime.hasTimezoneInfo ? "UTC" : "None recorded") },
  ];

  const presentRows = rows.filter((r) => r.value !== null && r.value !== undefined && r.value !== "");

  return (
    <div>
      <div className="exif-notice-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>{dateTime.timezoneNotice}</span>
      </div>

      {presentRows.length === 0 ? (
        <div className="exif-empty-section">
          <p>No date or timestamp tags were found in this image's metadata.</p>
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
