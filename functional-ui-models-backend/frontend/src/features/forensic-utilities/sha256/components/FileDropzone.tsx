import React, { useRef, useState } from "react";

interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  multiple?: boolean;
  title?: string;
  subtitle?: string;
}

export function FileDropzone({
  onFilesSelected,
  disabled = false,
  multiple = true,
  title = "Drop files here or click to browse",
  subtitle = "Supports all file types (images, videos, documents, binaries, empty files). Raw byte processing.",
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      onFilesSelected(multiple ? filesArray : [filesArray[0]]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      onFilesSelected(multiple ? filesArray : [filesArray[0]]);
      e.target.value = ""; // Reset to allow re-uploading same file
    }
  };

  return (
    <div
      className={`sha256-dropzone ${isDragging ? "sha256-dropzone--active" : ""} ${
        disabled ? "sha256-dropzone--disabled" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      aria-label="Upload files for SHA-256 fingerprinting"
    >
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        style={{ display: "none" }}
        onChange={handleFileChange}
        disabled={disabled}
      />
      <div className="sha256-dropzone__icon">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <div className="sha256-dropzone__title">{title}</div>
      <div className="sha256-dropzone__subtitle">{subtitle}</div>
    </div>
  );
}
