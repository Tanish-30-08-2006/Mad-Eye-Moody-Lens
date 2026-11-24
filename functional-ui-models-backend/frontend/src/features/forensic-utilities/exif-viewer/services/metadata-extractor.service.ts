/**
 * Metadata extraction service using exifr.
 * Parses EXIF, IPTC, XMP, ICC, and JFIF chunks locally in browser memory.
 */

import exifr from "exifr";
import type { CompleteImageMetadata } from "../types/metadata.types";
import type { SupportedImageFormat, RawExifTags } from "../types/exif.types";
import { parseAndValidateGps } from "./gps-converter.service.ts";
import {
  formatAperture,
  formatBytes,
  formatExposureTime,
  formatFocalLength,
  getExposureProgramDescription,
  getFlashDescription,
  getMeteringDescription,
  getOrientationDescription,
  getWhiteBalanceDescription,
  normalizeDateMetadata,
  calculateAspectRatio,
} from "../utils/metadata-normalizer.ts";

const KNOWN_EDITING_SOFTWARE_KEYWORDS = [
  "photoshop",
  "lightroom",
  "gimp",
  "canva",
  "snapseed",
  "vsco",
  "affinity",
  "pixelmator",
  "paint.net",
  "corel",
  "capture one",
  "aftershot",
  "dxo",
  "darktable",
  "rawtherapee",
  "picsart",
  "inshot",
  "facetune",
  "procreate",
];

export async function extractMetadataFromFile(
  file: File | Blob,
  fileName: string,
  detectedFormat: SupportedImageFormat,
  naturalWidth?: number | null,
  naturalHeight?: number | null,
  naturalAspectRatio?: string | null
): Promise<CompleteImageMetadata> {
  let raw: RawExifTags = {};
  let hasExif = false;
  const warnings: string[] = [];

  try {
    const parsed = await exifr.parse(file, {
      tiff: true,
      xmp: true,
      icc: true,
      iptc: true,
      jfif: true,
      mergeOutput: true,
    });

    if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
      raw = parsed as RawExifTags;
      hasExif = true;
    }
  } catch (err) {
    warnings.push(`EXIF parsing note: ${err instanceof Error ? err.message : "Metadata parsing encountered warnings."}`);
  }

  // Width & Height
  const width = naturalWidth || (typeof raw.ImageWidth === "number" ? raw.ImageWidth : typeof raw.ExifImageWidth === "number" ? raw.ExifImageWidth : null);
  const height = naturalHeight || (typeof raw.ImageHeight === "number" ? raw.ImageHeight : typeof raw.ExifImageHeight === "number" ? raw.ExifImageHeight : null);
  const aspectRatio = naturalAspectRatio || (width && height ? calculateAspectRatio(width, height) : null);

  // Orientation
  const rawOrientation = raw.Orientation;
  const orientationNum = typeof rawOrientation === "number" ? rawOrientation : null;
  const orientationDesc = getOrientationDescription(rawOrientation);

  // Color Space
  let colorSpace: string | null = null;
  if (raw.ColorSpace === 1 || raw.ColorSpace === "sRGB") {
    colorSpace = "sRGB";
  } else if (raw.ColorSpace === 2 || raw.ColorSpace === "Adobe RGB") {
    colorSpace = "Adobe RGB";
  } else if (raw.ColorSpace === 65535 || raw.ColorSpace === "Uncalibrated") {
    colorSpace = "Uncalibrated";
  } else if (raw.ColorSpace) {
    colorSpace = String(raw.ColorSpace);
  }

  // Bit Depth
  let bitDepth: string | null = null;
  if (raw.BitsPerSample) {
    if (Array.isArray(raw.BitsPerSample)) {
      bitDepth = `${raw.BitsPerSample.join(", ")} bits/sample`;
    } else {
      bitDepth = `${raw.BitsPerSample} bits`;
    }
  }

  // Camera & Device
  const make = raw.Make ? String(raw.Make).trim() : null;
  const model = raw.Model ? String(raw.Model).trim() : null;
  const lensMake = raw.LensMake ? String(raw.LensMake).trim() : null;
  const lensModel = raw.LensModel ? String(raw.LensModel).trim() : null;
  const expTime = typeof raw.ExposureTime === "number" ? raw.ExposureTime : null;
  const fNum = typeof raw.FNumber === "number" ? raw.FNumber : typeof raw.ApertureValue === "number" ? raw.ApertureValue : null;
  const iso = typeof raw.ISO === "number" ? raw.ISO : typeof raw.ISOSpeedRatings === "number" ? raw.ISOSpeedRatings : typeof raw.PhotographicSensitivity === "number" ? raw.PhotographicSensitivity : null;
  const focalLen = typeof raw.FocalLength === "number" ? raw.FocalLength : null;
  const focalLen35 = typeof raw.FocalLengthIn35mmFormat === "number" ? raw.FocalLengthIn35mmFormat : null;

  // Software & Editing Detection
  const software = raw.Software ? String(raw.Software).trim() : null;
  const processingSoftware = raw.ProcessingSoftware ? String(raw.ProcessingSoftware).trim() : null;
  const xmpSoftware = raw.creatorTool ? String(raw.creatorTool).trim() : null;
  const iptcCreator = raw.Artist || raw.byline ? String(raw.Artist || raw.byline).trim() : null;
  const iptcDescription = raw.ImageDescription || raw.description ? String(raw.ImageDescription || raw.description).trim() : null;

  const combinedSoftwareStr = `${software || ""} ${processingSoftware || ""} ${xmpSoftware || ""}`.toLowerCase();
  const isEditingSoftwarePresent = KNOWN_EDITING_SOFTWARE_KEYWORDS.some((kw) => combinedSoftwareStr.includes(kw));
  const editingSoftwareNotice = isEditingSoftwarePresent
    ? "Editing or post-processing software metadata detected. (Note: Editing metadata records tools used and does not independently prove deceptive manipulation)."
    : "No third-party image editor signatures identified in embedded metadata.";

  // GPS Extraction & Validation
  const gpsRes = parseAndValidateGps({
    latitude: raw.latitude,
    longitude: raw.longitude,
    GPSLatitude: raw.GPSLatitude,
    GPSLatitudeRef: raw.GPSLatitudeRef,
    GPSLongitude: raw.GPSLongitude,
    GPSLongitudeRef: raw.GPSLongitudeRef,
    GPSAltitude: raw.GPSAltitude,
    GPSAltitudeRef: raw.GPSAltitudeRef,
    GPSDateStamp: raw.GPSDateStamp,
    GPSTimeStamp: raw.GPSTimeStamp,
    GPSProcessingMethod: raw.GPSProcessingMethod,
    GPSImgDirection: raw.GPSImgDirection,
    GPSImgDirectionRef: raw.GPSImgDirectionRef,
  });

  const gpsNotice = gpsRes.valid && gpsRes.coordinates
    ? "GPS coordinates extracted from embedded EXIF tags."
    : "GPS metadata not present in this image.";

  // Date & Time Normalization
  const dateInfo = normalizeDateMetadata({
    DateTimeOriginal: raw.DateTimeOriginal,
    DateTimeDigitized: raw.DateTimeDigitized,
    ModifyDate: raw.ModifyDate,
    DateTime: raw.DateTime,
    OffsetTimeOriginal: raw.OffsetTimeOriginal,
    OffsetTime: raw.OffsetTime,
    SubSecTimeOriginal: raw.SubSecTimeOriginal,
  });

  // Forensic Limitations
  const limitations = [
    "Embedded metadata does not prove authenticity and can be modified, stripped, or spoofed.",
    "Absence of GPS coordinates is common in modern smartphones and privacy-focused social platforms and does not indicate file tampering.",
    "Capture timestamps reflect the device clock at time of capture and may not correspond to actual UTC wall-clock time.",
    "Presence of editing software signatures indicates post-processing but does not establish malicious deepfake manipulation.",
  ];

  return {
    basic: {
      filename: fileName,
      fileSize: file.size,
      formattedFileSize: formatBytes(file.size),
      mimeType: file.type || "application/octet-stream",
      detectedFormat,
      width,
      height,
      aspectRatio,
      colorSpace,
      orientation: orientationNum,
      orientationDescription: orientationDesc,
      bitDepth,
    },
    camera: {
      make,
      model,
      lensMake,
      lensModel,
      software,
      exposureTime: expTime,
      formattedExposureTime: formatExposureTime(expTime || undefined),
      fNumber: fNum,
      formattedAperture: formatAperture(fNum || undefined),
      iso,
      focalLength: focalLen,
      formattedFocalLength: formatFocalLength(focalLen || undefined),
      focalLengthIn35mm: focalLen35,
      flash: raw.Flash ?? null,
      flashDescription: getFlashDescription(raw.Flash),
      whiteBalance: raw.WhiteBalance ? String(raw.WhiteBalance) : null,
      whiteBalanceDescription: getWhiteBalanceDescription(raw.WhiteBalance),
      meteringMode: raw.MeteringMode ? String(raw.MeteringMode) : null,
      meteringModeDescription: getMeteringDescription(raw.MeteringMode),
      exposureProgram: raw.ExposureProgram ? String(raw.ExposureProgram) : null,
      exposureProgramDescription: getExposureProgramDescription(raw.ExposureProgram),
    },
    dateTime: dateInfo,
    gps: {
      gpsData: gpsRes.valid ? gpsRes.coordinates : null,
      hasGps: gpsRes.valid,
      gpsNotice,
    },
    software: {
      software,
      processingSoftware,
      xmpSoftware,
      iptcCreator,
      iptcDescription,
      isEditingSoftwarePresent,
      editingSoftwareNotice,
    },
    rawExif: raw as Record<string, unknown>,
    warnings,
    limitations,
    extractedAt: new Date().toISOString(),
    hasExifData: hasExif,
  };
}
