/**
 * Camera, device, and optical settings section component.
 */

import { useState } from "react";
import { CameraDeviceInfo } from "../types/metadata.types";
import { copyToClipboard } from "../utils/metadata-export";

interface CameraMetadataProps {
  camera: CameraDeviceInfo;
}

export function CameraMetadata({ camera }: CameraMetadataProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (key: string, val: string) => {
    const ok = await copyToClipboard(val);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    }
  };

  const rows = [
    { label: "Camera make", value: camera.make },
    { label: "Camera model", value: camera.model },
    { label: "Lens model", value: camera.lensModel },
    { label: "Lens make", value: camera.lensMake },
    { label: "Exposure time (shutter)", value: camera.formattedExposureTime || (camera.exposureTime ? `${camera.exposureTime} s` : null) },
    { label: "Aperture (F-number)", value: camera.formattedAperture || (camera.fNumber ? `f/${camera.fNumber}` : null) },
    { label: "ISO sensitivity", value: camera.iso ? `ISO ${camera.iso}` : null },
    { label: "Focal length", value: camera.formattedFocalLength || (camera.focalLength ? `${camera.focalLength} mm` : null) },
    { label: "Focal length (35mm equivalent)", value: camera.focalLengthIn35mm ? `${camera.focalLengthIn35mm} mm` : null },
    { label: "Flash status", value: camera.flashDescription },
    { label: "White balance", value: camera.whiteBalanceDescription },
    { label: "Metering mode", value: camera.meteringModeDescription },
    { label: "Exposure program", value: camera.exposureProgramDescription },
  ];

  const presentRows = rows.filter((r) => r.value !== null && r.value !== undefined && r.value !== "");

  if (presentRows.length === 0) {
    return (
      <div className="exif-empty-section">
        <p>No camera, optical, or device tags were found in this image's metadata.</p>
      </div>
    );
  }

  return (
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
  );
}
