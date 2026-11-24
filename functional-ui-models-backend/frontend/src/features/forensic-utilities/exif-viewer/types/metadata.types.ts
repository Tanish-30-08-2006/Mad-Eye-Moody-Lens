/**
 * Complete normalized metadata structure for presentation and export.
 */

import { GpsCoordinates } from "./gps.types";
import { SupportedImageFormat } from "./exif.types";

export interface BasicImageInfo {
  filename: string;
  fileSize: number;
  formattedFileSize: string;
  mimeType: string;
  detectedFormat: SupportedImageFormat;
  width: number | null;
  height: number | null;
  aspectRatio: string | null;
  colorSpace: string | null;
  orientation: number | null;
  orientationDescription: string | null;
  bitDepth: string | null;
}

export interface CameraDeviceInfo {
  make: string | null;
  model: string | null;
  lensMake: string | null;
  lensModel: string | null;
  software: string | null;
  exposureTime: number | null;
  formattedExposureTime: string | null;
  fNumber: number | null;
  formattedAperture: string | null;
  iso: number | null;
  focalLength: number | null;
  formattedFocalLength: string | null;
  focalLengthIn35mm: number | null;
  flash: number | string | null;
  flashDescription: string | null;
  whiteBalance: string | null;
  whiteBalanceDescription: string | null;
  meteringMode: string | null;
  meteringModeDescription: string | null;
  exposureProgram: string | null;
  exposureProgramDescription: string | null;
}

export interface DateTimeInfo {
  dateTimeOriginal: string | null;
  dateTimeDigitized: string | null;
  modifyDate: string | null;
  subSecTimeOriginal: string | null;
  offsetTimeOriginal: string | null;
  rawDateStrings: Record<string, string>;
  hasTimezoneInfo: boolean;
  timezoneNotice: string;
}

export interface GpsInfo {
  gpsData: GpsCoordinates | null;
  hasGps: boolean;
  gpsNotice: string;
}

export interface SoftwareInfo {
  software: string | null;
  processingSoftware: string | null;
  xmpSoftware: string | null;
  iptcCreator: string | null;
  iptcDescription: string | null;
  isEditingSoftwarePresent: boolean;
  editingSoftwareNotice: string;
}

export interface CompleteImageMetadata {
  basic: BasicImageInfo;
  camera: CameraDeviceInfo;
  dateTime: DateTimeInfo;
  gps: GpsInfo;
  software: SoftwareInfo;
  rawExif: Record<string, unknown>;
  warnings: string[];
  limitations: string[];
  extractedAt: string;
  hasExifData: boolean;
}
