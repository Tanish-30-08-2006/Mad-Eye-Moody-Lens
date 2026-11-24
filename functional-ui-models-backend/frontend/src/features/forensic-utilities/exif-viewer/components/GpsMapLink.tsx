/**
 * Map visualization link card for embedded GPS coordinates.
 */

import { useState } from "react";
import { GpsCoordinates } from "../types/gps.types";
import { copyToClipboard } from "../utils/metadata-export";

interface GpsMapLinkProps {
  gps: GpsCoordinates;
}

export function GpsMapLink({ gps }: GpsMapLinkProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(`${gps.latitude}, ${gps.longitude}`);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="exif-map-card">
      <div className="exif-map-header">
        <div className="exif-map-pin-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <div>
          <h4 className="exif-map-title">Embedded Geolocation Coordinates</h4>
          <p className="exif-map-desc">
            Location decoded directly from embedded EXIF GPS tags. Coordinates are accurate to standard GPS precision.
          </p>
        </div>
      </div>

      <div className="exif-map-coords-bar">
        <div className="exif-coords-display">
          <span className="exif-coords-primary">{gps.humanReadable}</span>
          <span className="exif-coords-decimal">
            Decimal: {gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)}
          </span>
        </div>

        <button
          type="button"
          className="bonsai-btn-secondary"
          onClick={handleCopy}
          title="Copy decimal coordinates to clipboard"
        >
          {copied ? "✓ Copied" : "Copy Coordinates"}
        </button>
      </div>

      <div className="exif-map-actions">
        <a
          href={gps.openStreetMapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bonsai-btn-primary"
        >
          View on OpenStreetMap ↗
        </a>
        <a
          href={gps.googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bonsai-btn-secondary"
        >
          View on Google Maps ↗
        </a>
      </div>
    </div>
  );
}
