/**
 * Metadata normalization utilities for formatting photographic, camera, and date values.
 */

/**
 * Calculates greatest common divisor to determine aspect ratio.
 */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function calculateAspectRatio(width: number, height: number): string | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const divisor = gcd(Math.round(width), Math.round(height));
  const wRatio = Math.round(width) / divisor;
  const hRatio = Math.round(height) / divisor;

  // Common standard ratios check for clarity
  const decimal = width / height;
  if (Math.abs(decimal - 16 / 9) < 0.02) return "16:9";
  if (Math.abs(decimal - 4 / 3) < 0.02) return "4:3";
  if (Math.abs(decimal - 3 / 2) < 0.02) return "3:2";
  if (Math.abs(decimal - 1) < 0.01) return "1:1";
  if (Math.abs(decimal - 9 / 16) < 0.02) return "9:16 (Portrait)";
  if (Math.abs(decimal - 3 / 4) < 0.02) return "3:4 (Portrait)";
  if (Math.abs(decimal - 2 / 3) < 0.02) return "2:3 (Portrait)";

  return `${wRatio}:${hRatio}`;
}

export function formatExposureTime(seconds?: number): string | null {
  if (typeof seconds !== "number" || isNaN(seconds) || seconds <= 0) return null;
  if (seconds >= 1) {
    return `${Number(seconds.toFixed(2))} s`;
  }
  const denominator = Math.round(1 / seconds);
  return `1/${denominator} s`;
}

export function formatAperture(fNumber?: number): string | null {
  if (typeof fNumber !== "number" || isNaN(fNumber) || fNumber <= 0) return null;
  return `f/${Number(fNumber.toFixed(1))}`;
}

export function formatFocalLength(mm?: number): string | null {
  if (typeof mm !== "number" || isNaN(mm) || mm <= 0) return null;
  return `${Number(mm.toFixed(1))} mm`;
}

export function formatBytes(bytes: number): string {
  if (isNaN(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const ORIENTATION_DESCRIPTIONS: Record<string, string> = {
  "1": "Horizontal (normal)",
  "2": "Mirrored horizontal",
  "3": "Rotated 180°",
  "4": "Mirrored vertical",
  "5": "Mirrored horizontal & rotated 270° CW",
  "6": "Rotated 90° CW",
  "7": "Mirrored horizontal & rotated 90° CW",
  "8": "Rotated 270° CW",
};

export const METERING_MODES: Record<string, string> = {
  "0": "Unknown",
  "1": "Average",
  "2": "Center-weighted average",
  "3": "Spot",
  "4": "Multi-spot",
  "5": "Multi-segment (Pattern)",
  "6": "Partial",
};

export const EXPOSURE_PROGRAMS: Record<string, string> = {
  "0": "Not defined",
  "1": "Manual",
  "2": "Normal program (Auto)",
  "3": "Aperture priority",
  "4": "Shutter priority",
  "5": "Creative program (biased depth of field)",
  "6": "Action program (biased fast shutter speed)",
  "7": "Portrait mode",
  "8": "Landscape mode",
};

export const WHITE_BALANCES: Record<string, string> = {
  "0": "Auto",
  "1": "Manual",
};

export function getOrientationDescription(val?: unknown): string | null {
  if (val === undefined || val === null) return null;
  const key = String(val);
  return ORIENTATION_DESCRIPTIONS[key] || `Orientation ${key}`;
}

export function getMeteringDescription(val?: unknown): string | null {
  if (val === undefined || val === null) return null;
  const key = String(val);
  return METERING_MODES[key] || `Mode ${key}`;
}

export function getExposureProgramDescription(val?: unknown): string | null {
  if (val === undefined || val === null) return null;
  const key = String(val);
  return EXPOSURE_PROGRAMS[key] || `Program ${key}`;
}

export function getWhiteBalanceDescription(val?: unknown): string | null {
  if (val === undefined || val === null) return null;
  const key = String(val);
  return WHITE_BALANCES[key] || `Balance ${key}`;
}

export function getFlashDescription(val?: unknown): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val === "string") return val;
  const num = Number(val);
  if (isNaN(num)) return String(val);
  const fired = (num & 1) !== 0;
  return fired ? "Flash fired" : "Flash did not fire";
}

/**
 * Normalizes date metadata without silently converting timezone-less values to local time.
 */
export function normalizeDateMetadata(raw: {
  DateTimeOriginal?: Date | string;
  DateTimeDigitized?: Date | string;
  ModifyDate?: Date | string;
  DateTime?: Date | string;
  OffsetTimeOriginal?: string;
  OffsetTime?: string;
  SubSecTimeOriginal?: string;
}): {
  dateTimeOriginal: string | null;
  dateTimeDigitized: string | null;
  modifyDate: string | null;
  subSecTimeOriginal: string | null;
  offsetTimeOriginal: string | null;
  rawDateStrings: Record<string, string>;
  hasTimezoneInfo: boolean;
  timezoneNotice: string;
} {
  const rawDateStrings: Record<string, string> = {};

  const parseVal = (v: unknown): string | null => {
    if (!v) return null;
    if (v instanceof Date) {
      return v.toISOString();
    }
    return String(v);
  };

  const origStr = parseVal(raw.DateTimeOriginal);
  if (origStr) rawDateStrings.DateTimeOriginal = origStr;

  const digStr = parseVal(raw.DateTimeDigitized);
  if (digStr) rawDateStrings.DateTimeDigitized = digStr;

  const modStr = parseVal(raw.ModifyDate || raw.DateTime);
  if (modStr) rawDateStrings.ModifyDate = modStr;

  const offset = raw.OffsetTimeOriginal || raw.OffsetTime || null;
  const subSec = raw.SubSecTimeOriginal ? String(raw.SubSecTimeOriginal) : null;

  const hasTimezone = Boolean(offset || (origStr && (origStr.endsWith("Z") || origStr.includes("+") || (origStr.includes("-") && origStr.length > 19))));

  let timezoneNotice = "";
  if (hasTimezone) {
    timezoneNotice = offset ? `Recorded timezone offset: ${offset}` : "UTC timestamp detected.";
  } else {
    timezoneNotice = "No timezone offset recorded in metadata. Displayed as recorded camera clock.";
  }

  return {
    dateTimeOriginal: origStr,
    dateTimeDigitized: digStr,
    modifyDate: modStr,
    subSecTimeOriginal: subSec,
    offsetTimeOriginal: offset,
    rawDateStrings,
    hasTimezoneInfo: hasTimezone,
    timezoneNotice,
  };
}
