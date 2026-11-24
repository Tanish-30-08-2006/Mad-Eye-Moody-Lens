/**
 * Main container component for the Image Metadata & EXIF Viewer feature.
 */

import { useState } from "react";
import { useImageUpload } from "../hooks/useImageUpload";
import { useExifMetadata } from "../hooks/useExifMetadata";
import { ExifViewerHeader } from "./ExifViewerHeader";
import { ImageUpload } from "./ImageUpload";
import { UploadedImagePreview } from "./UploadedImagePreview";
import { MetadataOverview } from "./MetadataOverview";
import { MetadataSection } from "./MetadataSection";
import { BasicImageMetadata } from "./BasicImageMetadata";
import { CameraMetadata } from "./CameraMetadata";
import { DateMetadata } from "./DateMetadata";
import { GpsMetadata } from "./GpsMetadata";
import { SoftwareMetadata } from "./SoftwareMetadata";
import { MetadataWarnings } from "./MetadataWarnings";
import { MetadataExport } from "./MetadataExport";
import { MetadataEmptyState } from "./MetadataEmptyState";
import { MetadataLoadingState } from "./MetadataLoadingState";
import { MetadataErrorState } from "./MetadataErrorState";
import { copyToClipboard } from "../utils/metadata-export";
import "../ExifViewer.css";

interface ExifViewerPageProps {
  onNavigateHome?: () => void;
  onNavigateDuplicate?: () => void;
  onNavigateSha256?: () => void;
}

export function ExifViewerPage({
  onNavigateHome,
  onNavigateDuplicate,
  onNavigateSha256,
}: ExifViewerPageProps) {
  const [activeTab, setActiveTab] = useState<"sections" | "raw">("sections");
  const [rawCopied, setRawCopied] = useState(false);

  const {
    file,
    previewUrl,
    error: uploadError,
    width,
    height,
    aspectRatio,
    detectedFormat,
    isValidating,
    selectFile,
    removeFile,
  } = useImageUpload();

  const {
    metadata,
    isLoading: isExtracting,
    error: extractError,
    clear: clearMetadata,
  } = useExifMetadata(file, detectedFormat, width, height, aspectRatio);

  const handleRemove = () => {
    removeFile();
    clearMetadata();
  };

  const handleCopyRaw = async () => {
    if (!metadata?.rawExif) return;
    const ok = await copyToClipboard(JSON.stringify(metadata.rawExif, null, 2));
    if (ok) {
      setRawCopied(true);
      setTimeout(() => setRawCopied(false), 2000);
    }
  };

  const error = uploadError || extractError;
  const isBusy = isValidating || isExtracting;

  return (
    <div className="exif-page" id="exif-viewer">
      <div className="exif-container">
        {/* Header with Navigation and Privacy Banner */}
        <ExifViewerHeader
          onNavigateHome={onNavigateHome}
          onNavigateDuplicate={onNavigateDuplicate}
          onNavigateSha256={onNavigateSha256}
        />

        {/* Upload Workspace or Selected Image Preview */}
        {!file ? (
          <ImageUpload onFileSelected={selectFile} disabled={isBusy} />
        ) : (
          <UploadedImagePreview
            file={file}
            previewUrl={previewUrl}
            detectedFormat={detectedFormat}
            width={width}
            height={height}
            aspectRatio={aspectRatio}
            onReplaceFile={selectFile}
            onRemoveFile={handleRemove}
            isProcessing={isBusy}
          />
        )}

        {/* Error State */}
        {error && <MetadataErrorState error={error} onClear={handleRemove} />}

        {/* Loading State */}
        {isBusy && <MetadataLoadingState />}

        {/* Extracted Metadata View */}
        {!isBusy && metadata && (
          <div className="exif-results-area">
            {/* Forensic Overview Metric Cards */}
            <MetadataOverview metadata={metadata} />

            {/* View Mode Tab Switcher */}
            <div className="exif-tabs-bar" role="tablist">
              <button
                type="button"
                className={`exif-tab-pill ${activeTab === "sections" ? "is-active" : ""}`}
                onClick={() => setActiveTab("sections")}
                role="tab"
                aria-selected={activeTab === "sections"}
              >
                Forensic Analysis Sections
              </button>
              <button
                type="button"
                className={`exif-tab-pill ${activeTab === "raw" ? "is-active" : ""}`}
                onClick={() => setActiveTab("raw")}
                role="tab"
                aria-selected={activeTab === "raw"}
              >
                Raw Tag Inspection ({Object.keys(metadata.rawExif).length} tags)
              </button>
            </div>

            {activeTab === "sections" ? (
              <div className="exif-sections-list">
                {/* 1. Basic Image & Format Information */}
                <MetadataSection
                  title="1. Basic File & Container Information"
                  badge={metadata.basic.detectedFormat}
                  description="Physical file properties, format validation, and natural pixel dimensions."
                >
                  <BasicImageMetadata info={metadata.basic} />
                </MetadataSection>

                {/* 2. Camera, Device & Optical Settings */}
                <MetadataSection
                  title="2. Camera & Optical Settings"
                  badge={metadata.camera.make ? `${metadata.camera.make} ${metadata.camera.model || ""}`.trim() : undefined}
                  badgeType={metadata.camera.make ? "success" : "default"}
                  description="Hardware identification, focal length, aperture, exposure speed, and sensor sensitivity."
                >
                  <CameraMetadata camera={metadata.camera} />
                </MetadataSection>

                {/* 3. Date & Time Records */}
                <MetadataSection
                  title="3. Date & Timestamp Analysis"
                  badge={metadata.dateTime.dateTimeOriginal ? "Timestamped" : undefined}
                  description="Capture, digitization, and modification clocks with timezone verification."
                >
                  <DateMetadata dateTime={metadata.dateTime} />
                </MetadataSection>

                {/* 4. GPS Geolocation & Map */}
                <MetadataSection
                  title="4. Geolocation & GPS Coordinates"
                  badge={metadata.gps.hasGps ? "Coordinates Available" : "No GPS"}
                  badgeType={metadata.gps.hasGps ? "success" : "default"}
                  description="Satellite navigation coordinates, altitude, and mapping links."
                >
                  <GpsMetadata gpsInfo={metadata.gps} />
                </MetadataSection>

                {/* 5. Software & Post-Processing Signatures */}
                <MetadataSection
                  title="5. Software Signatures & Post-Processing"
                  badge={metadata.software.isEditingSoftwarePresent ? "Editing Tags Found" : undefined}
                  badgeType={metadata.software.isEditingSoftwarePresent ? "warning" : "default"}
                  description="Recorded software, firmware versions, IPTC creator information, and editor signatures."
                >
                  <SoftwareMetadata software={metadata.software} />
                </MetadataSection>

                {/* 6. Forensic Limitations & Warnings */}
                <MetadataWarnings
                  warnings={metadata.warnings}
                  limitations={metadata.limitations}
                />
              </div>
            ) : (
              <div className="exif-raw-view-wrap">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                    Raw tag dictionary decoded directly from image chunks.
                  </span>
                  <button
                    type="button"
                    className="bonsai-btn-secondary exif-btn-sm"
                    onClick={handleCopyRaw}
                  >
                    {rawCopied ? "✓ Raw JSON Copied" : "Copy Raw JSON"}
                  </button>
                </div>
                <pre className="exif-raw-view-card">
                  {JSON.stringify(metadata.rawExif, null, 2)}
                </pre>
              </div>
            )}

            {/* Export & Evidence Actions */}
            <MetadataExport metadata={metadata} />
          </div>
        )}

        {/* Empty State when no file is chosen */}
        {!file && !isBusy && !error && <MetadataEmptyState />}
      </div>
    </div>
  );
}
