/**
 * Metadata export and clipboard utilities.
 */

import type { CompleteImageMetadata } from "../types/metadata.types";

/**
 * Serializes CompleteImageMetadata into structured, clean JSON for export.
 */
export function exportMetadataToJson(metadata: CompleteImageMetadata): string {
  const exportPayload = {
    schemaVersion: "1.0",
    generator: "Mad-Eye Moody Lens Forensic Utilities · Image Metadata & EXIF Viewer",
    exportedAt: new Date().toISOString(),
    file: {
      filename: metadata.basic.filename,
      sizeBytes: metadata.basic.fileSize,
      formattedSize: metadata.basic.formattedFileSize,
      detectedFormat: metadata.basic.detectedFormat,
      width: metadata.basic.width,
      height: metadata.basic.height,
      aspectRatio: metadata.basic.aspectRatio,
      colorSpace: metadata.basic.colorSpace,
      orientation: metadata.basic.orientationDescription,
      bitDepth: metadata.basic.bitDepth,
    },
    camera: {
      make: metadata.camera.make,
      model: metadata.camera.model,
      lensModel: metadata.camera.lensModel,
      exposureTime: metadata.camera.formattedExposureTime,
      aperture: metadata.camera.formattedAperture,
      iso: metadata.camera.iso,
      focalLength: metadata.camera.formattedFocalLength,
      focalLengthIn35mm: metadata.camera.focalLengthIn35mm,
      flash: metadata.camera.flashDescription,
      whiteBalance: metadata.camera.whiteBalanceDescription,
      meteringMode: metadata.camera.meteringModeDescription,
      exposureProgram: metadata.camera.exposureProgramDescription,
    },
    timestamps: {
      dateTimeOriginal: metadata.dateTime.dateTimeOriginal,
      dateTimeDigitized: metadata.dateTime.dateTimeDigitized,
      modifyDate: metadata.dateTime.modifyDate,
      subSecTime: metadata.dateTime.subSecTimeOriginal,
      offsetTimeOriginal: metadata.dateTime.offsetTimeOriginal,
      hasTimezone: metadata.dateTime.hasTimezoneInfo,
      timezoneNotice: metadata.dateTime.timezoneNotice,
    },
    gps: metadata.gps.hasGps && metadata.gps.gpsData
      ? {
          present: true,
          latitude: metadata.gps.gpsData.latitude,
          longitude: metadata.gps.gpsData.longitude,
          latitudeRef: metadata.gps.gpsData.latitudeRef,
          longitudeRef: metadata.gps.gpsData.longitudeRef,
          altitude: metadata.gps.gpsData.altitude,
          humanReadable: metadata.gps.gpsData.humanReadable,
          googleMapsUrl: metadata.gps.gpsData.googleMapsUrl,
          openStreetMapUrl: metadata.gps.gpsData.openStreetMapUrl,
        }
      : {
          present: false,
          notice: metadata.gps.gpsNotice,
        },
    software: {
      recordedSoftware: metadata.software.software,
      processingSoftware: metadata.software.processingSoftware,
      xmpSoftware: metadata.software.xmpSoftware,
      isEditingSoftwarePresent: metadata.software.isEditingSoftwarePresent,
      notice: metadata.software.editingSoftwareNotice,
    },
    forensicLimitations: metadata.limitations,
    rawExif: metadata.rawExif,
  };

  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Triggers a client-side browser file download.
 */
export function triggerDownload(content: string, filename: string, mimeType = "application/json"): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copies text to user clipboard with safe fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }

  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}
