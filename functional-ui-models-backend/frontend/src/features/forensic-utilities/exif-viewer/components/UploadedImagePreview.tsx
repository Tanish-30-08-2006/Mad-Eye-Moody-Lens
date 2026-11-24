/**
 * Preview panel for the currently loaded image.
 */

import React, { useRef } from "react";
import { SupportedImageFormat } from "../types/exif.types";
import { formatBytes } from "../utils/metadata-normalizer";

interface UploadedImagePreviewProps {
  file: File;
  previewUrl: string | null;
  detectedFormat: SupportedImageFormat;
  width: number | null;
  height: number | null;
  aspectRatio: string | null;
  onReplaceFile: (file: File) => void;
  onRemoveFile: () => void;
  isProcessing?: boolean;
}

export function UploadedImagePreview({
  file,
  previewUrl,
  detectedFormat,
  width,
  height,
  aspectRatio,
  onReplaceFile,
  onRemoveFile,
  isProcessing,
}: UploadedImagePreviewProps) {
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const handleReplaceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onReplaceFile(e.target.files[0]);
      e.target.value = "";
    }
  };

  return (
    <div className="exif-preview-card">
      <input
        ref={replaceInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,image/jpeg,image/png,image/webp,image/tiff"
        style={{ display: "none" }}
        disabled={isProcessing}
        onChange={handleReplaceChange}
      />

      <div className="exif-preview-media">
        {previewUrl ? (
          <img src={previewUrl} alt={file.name} className="exif-preview-img" />
        ) : (
          <div className="exif-preview-placeholder">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>No preview available</span>
          </div>
        )}
      </div>

      <div className="exif-preview-info">
        <div className="exif-preview-header">
          <div className="exif-preview-badges">
            <span className="exif-format-badge">{detectedFormat}</span>
            {aspectRatio && <span className="exif-ratio-badge">{aspectRatio}</span>}
          </div>
          <h3 className="exif-preview-filename" title={file.name}>
            {file.name}
          </h3>
        </div>

        <div className="exif-preview-meta-grid">
          <div className="exif-preview-meta-item">
            <span className="exif-meta-label">File size</span>
            <span className="exif-meta-value">{formatBytes(file.size)}</span>
          </div>

          <div className="exif-preview-meta-item">
            <span className="exif-meta-label">Resolution</span>
            <span className="exif-meta-value">
              {width && height ? `${width} × ${height} px` : "Decoding..."}
            </span>
          </div>

          <div className="exif-preview-meta-item">
            <span className="exif-meta-label">MIME Type</span>
            <span className="exif-meta-value">{file.type || "application/octet-stream"}</span>
          </div>
        </div>

        <div className="exif-preview-actions">
          <button
            type="button"
            className="bonsai-btn-secondary"
            onClick={() => replaceInputRef.current?.click()}
            disabled={isProcessing}
          >
            Replace Image
          </button>
          <button
            type="button"
            className="bonsai-btn-secondary exif-btn-danger"
            onClick={onRemoveFile}
            disabled={isProcessing}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
