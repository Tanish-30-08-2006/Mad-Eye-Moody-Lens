/**
 * Geolocation & GPS metadata table component.
 */

import { useState } from "react";
import { GpsInfo } from "../types/metadata.types";
import { GpsMapLink } from "./GpsMapLink";
import { copyToClipboard } from "../utils/metadata-export";

interface GpsMetadataProps {
  gpsInfo: GpsInfo;
}

export function GpsMetadata({ gpsInfo }: GpsMetadataProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (key: string, val: string) => {
    const ok = await copyToClipboard(val);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    }
  };

  if (!gpsInfo.hasGps || !gpsInfo.gpsData) {
    return (
      <div className="exif-empty-section">
        <div className="exif-notice-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>
            {gpsInfo.gpsNotice} (Absence of GPS tags is standard across social media uploads, privacy-configured
            smartphones, and stripped files, and does not indicate file manipulation).
          </span>
        </div>
      </div>
    );
  }

  const { gpsData } = gpsInfo;

  const rows = [
    { label: "Latitude", value: `${gpsData.latitude}° (${gpsData.latitudeRef})` },
    { label: "Longitude", value: `${gpsData.longitude}° (${gpsData.longitudeRef})` },
    { label: "Human-readable DMS", value: gpsData.humanReadable },
    { label: "Altitude", value: gpsData.altitude !== null ? `${gpsData.altitude} meters` : null },
    { label: "Altitude reference", value: gpsData.altitudeRef },
    { label: "GPS Date/Time", value: gpsData.dateStamp || gpsData.timeStamp ? `${gpsData.dateStamp || ""} ${gpsData.timeStamp || ""}`.trim() : null },
    { label: "Processing method", value: gpsData.processingMethod },
    { label: "Image direction", value: gpsData.direction !== undefined ? `${gpsData.direction}° (${gpsData.directionRef || "True north"})` : null },
  ];

  const presentRows = rows.filter((r) => r.value !== null && r.value !== undefined && r.value !== "");

  return (
    <div>
      <GpsMapLink gps={gpsData} />

      <div className="exif-table-wrap" style={{ marginTop: "24px" }}>
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
    </div>
  );
}
