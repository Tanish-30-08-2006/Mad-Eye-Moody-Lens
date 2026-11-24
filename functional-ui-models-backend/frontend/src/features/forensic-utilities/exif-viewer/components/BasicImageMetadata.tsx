/**
 * Basic image information section component.
 */

import { useState } from "react";
import { BasicImageInfo } from "../types/metadata.types";
import { copyToClipboard } from "../utils/metadata-export";

interface BasicImageMetadataProps {
  info: BasicImageInfo;
}

export function BasicImageMetadata({ info }: BasicImageMetadataProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (key: string, val: string) => {
    const ok = await copyToClipboard(val);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    }
  };

  const rows = [
    { label: "File name", value: info.filename, copyable: true },
    { label: "File size", value: `${info.formattedFileSize} (${info.fileSize.toLocaleString()} bytes)`, copyable: true },
    { label: "Detected format", value: info.detectedFormat, copyable: false },
    { label: "MIME type", value: info.mimeType, copyable: false },
    {
      label: "Dimensions",
      value: info.width && info.height ? `${info.width} × ${info.height} pixels` : "Unavailable",
      copyable: Boolean(info.width && info.height),
    },
    { label: "Aspect ratio", value: info.aspectRatio || "Unavailable", copyable: false },
    { label: "Color space", value: info.colorSpace || "Unspecified / Standard sRGB", copyable: false },
    { label: "Orientation", value: info.orientationDescription || (info.orientation ? `Tag ${info.orientation}` : "1 (Normal)"), copyable: false },
    { label: "Bit depth", value: info.bitDepth || "8 bits/channel (standard)", copyable: false },
  ];

  return (
    <div className="exif-table-wrap">
      <table className="exif-table">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="exif-table-label">{row.label}</td>
              <td className="exif-table-value">{row.value}</td>
              <td className="exif-table-action">
                {row.copyable && (
                  <button
                    type="button"
                    className="bonsai-btn-link exif-copy-btn"
                    onClick={() => handleCopy(row.label, row.value)}
                    title={`Copy ${row.label}`}
                  >
                    {copiedKey === row.label ? "Copied" : "Copy"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
