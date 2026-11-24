/**
 * File validation and image format detection utility.
 */

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB safety cap

export const SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"] as const;

export const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
] as const;

export type SupportedImageFormat = "JPEG" | "PNG" | "WEBP" | "TIFF" | "UNKNOWN";

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  detectedFormat: SupportedImageFormat;
}

/**
 * Sniffs magic bytes from the first 12 bytes of a file buffer to detect the actual format.
 */
export function detectFormatFromBytes(bytes: Uint8Array): SupportedImageFormat {
  if (!bytes || bytes.length < 4) return "UNKNOWN";

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "JPEG";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "PNG";
  }

  // TIFF: 49 49 2A 00 (Little Endian 'II*.') or 4D 4D 00 2A (Big Endian 'MM.*')
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
  ) {
    return "TIFF";
  }

  // WebP: RIFF (52 49 46 46) ... WEBP (57 45 42 50)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "WEBP";
  }

  return "UNKNOWN";
}

/**
 * Validates a file object based on size, extension, MIME type, and optional magic header bytes.
 */
export function validateImageFile(
  file: { name: string; size: number; type?: string },
  headerBytes?: Uint8Array
): FileValidationResult {
  // 1. Empty file
  if (!file || file.size === 0) {
    return {
      valid: false,
      error: "The selected file is empty (0 bytes).",
      detectedFormat: "UNKNOWN",
    };
  }

  // 2. Oversized file
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size (${sizeMb} MB) exceeds the 50 MB safety limit for browser processing.`,
      detectedFormat: "UNKNOWN",
    };
  }

  // 3. Extension check
  const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
  const hasValidExt = (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);

  // 4. Header bytes check if supplied
  let detectedFormat: SupportedImageFormat = "UNKNOWN";
  if (headerBytes && headerBytes.length >= 4) {
    detectedFormat = detectFormatFromBytes(headerBytes);
  } else {
    // Derive format tentatively from extension
    if (ext === ".jpg" || ext === ".jpeg") detectedFormat = "JPEG";
    else if (ext === ".png") detectedFormat = "PNG";
    else if (ext === ".webp") detectedFormat = "WEBP";
    else if (ext === ".tif" || ext === ".tiff") detectedFormat = "TIFF";
  }

  if (!hasValidExt && detectedFormat === "UNKNOWN") {
    return {
      valid: false,
      error: `Unsupported file extension (${ext || "none"}). Supported formats: JPEG, PNG, WebP, TIFF.`,
      detectedFormat: "UNKNOWN",
    };
  }

  if (headerBytes && detectedFormat === "UNKNOWN") {
    return {
      valid: false,
      error: "The file appears to be corrupted or is not a valid JPEG, PNG, WebP, or TIFF image.",
      detectedFormat: "UNKNOWN",
    };
  }

  return {
    valid: true,
    detectedFormat,
  };
}
