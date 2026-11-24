/**
 * At-a-glance forensic overview cards summarizing the most critical metadata elements.
 */

import { CompleteImageMetadata } from "../types/metadata.types";

interface MetadataOverviewProps {
  metadata: CompleteImageMetadata;
}

export function MetadataOverview({ metadata }: MetadataOverviewProps) {
  const cameraLabel =
    metadata.camera.make || metadata.camera.model
      ? `${metadata.camera.make || ""} ${metadata.camera.model || ""}`.trim()
      : "Not recorded";

  const dateLabel = metadata.dateTime.dateTimeOriginal || metadata.dateTime.modifyDate || "Not recorded";

  const resolutionLabel =
    metadata.basic.width && metadata.basic.height
      ? `${metadata.basic.width} × ${metadata.basic.height} px`
      : "Unknown";

  const gpsStatus = metadata.gps.hasGps ? "GPS Tagged" : "No GPS";
  const softwareStatus = metadata.software.isEditingSoftwarePresent
    ? "Editor Detected"
    : metadata.software.software
    ? "Device Software"
    : "No Software Tag";

  return (
    <div className="exif-overview-grid">
      <div className="exif-overview-card">
        <span className="exif-overview-label">Camera &amp; Device</span>
        <strong className="exif-overview-val" title={cameraLabel}>
          {cameraLabel}
        </strong>
        <span className="exif-overview-sub">
          {metadata.camera.lensModel || (metadata.camera.make ? "Original device" : "No EXIF make/model")}
        </span>
      </div>

      <div className="exif-overview-card">
        <span className="exif-overview-label">Capture Date</span>
        <strong className="exif-overview-val" title={dateLabel}>
          {dateLabel}
        </strong>
        <span className="exif-overview-sub">
          {metadata.dateTime.hasTimezoneInfo ? "Timezone verified" : "Device clock (no offset)"}
        </span>
      </div>

      <div className="exif-overview-card">
        <span className="exif-overview-label">Image Resolution</span>
        <strong className="exif-overview-val">{resolutionLabel}</strong>
        <span className="exif-overview-sub">
          {metadata.basic.aspectRatio ? `Aspect ratio: ${metadata.basic.aspectRatio}` : metadata.basic.detectedFormat}
        </span>
      </div>

      <div className="exif-overview-card">
        <span className="exif-overview-label">Geolocation</span>
        <strong className={`exif-overview-val ${metadata.gps.hasGps ? "exif-val-green" : ""}`}>
          {gpsStatus}
        </strong>
        <span className="exif-overview-sub">
          {metadata.gps.hasGps ? metadata.gps.gpsData?.humanReadable : "No coordinates embedded"}
        </span>
      </div>

      <div className="exif-overview-card">
        <span className="exif-overview-label">Software Signature</span>
        <strong
          className={`exif-overview-val ${metadata.software.isEditingSoftwarePresent ? "exif-val-amber" : ""}`}
        >
          {softwareStatus}
        </strong>
        <span className="exif-overview-sub" title={metadata.software.software || "None"}>
          {metadata.software.software || "No editing tags found"}
        </span>
      </div>
    </div>
  );
}
