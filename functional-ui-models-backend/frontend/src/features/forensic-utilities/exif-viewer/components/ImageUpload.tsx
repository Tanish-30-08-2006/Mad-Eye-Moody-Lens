/**
 * Universal drag-and-drop file upload zone for the EXIF Viewer.
 */

import React, { useRef, useState, useId } from "react";

interface ImageUploadProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export function ImageUpload({ onFileSelected, disabled }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelected(e.target.files[0]);
      e.target.value = "";
    }
  };

  return (
    <div
      className={`exif-upload-box ${isDragging ? "is-dragging" : ""} ${disabled ? "is-disabled" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        id={inputId}
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,image/jpeg,image/png,image/webp,image/tiff"
        style={{ display: "none" }}
        disabled={disabled}
        onChange={handleChange}
      />

      <div className="exif-upload-icon-wrap" aria-hidden="true">
        <svg
          className="exif-upload-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>

      <h2 className="exif-upload-title">Drop an image here to inspect metadata</h2>
      <p className="exif-upload-subtitle">
        Supports JPEG, PNG, WebP, and TIFF images up to 50 MB.
      </p>

      <button
        type="button"
        className="bonsai-btn-primary"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
        Browse image
      </button>

      <div className="exif-supported-chips">
        <span className="exif-format-chip">JPEG / JPG</span>
        <span className="exif-format-chip">PNG</span>
        <span className="exif-format-chip">WebP</span>
        <span className="exif-format-chip">TIFF / TIF</span>
      </div>
    </div>
  );
}
