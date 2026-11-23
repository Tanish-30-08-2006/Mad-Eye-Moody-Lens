/**
 * Hash validation and normalization utilities for SHA-256.
 */

/**
 * Normalizes a pasted hash string:
 * - Trims outer whitespace
 * - Strips optional leading '0x'
 * - Converts to lowercase
 */
export function normalizeHash(raw: string): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/^0x/i, "").toLowerCase();
}

/**
 * Checks whether a string is a valid 64-character hexadecimal SHA-256 digest.
 */
export function isValidSha256(raw: string): boolean {
  const norm = normalizeHash(raw);
  return /^[0-9a-f]{64}$/.test(norm);
}

/**
 * Returns a detailed, human-friendly validation error or null if valid.
 */
export function getHashValidationError(raw: string, fieldName = "Hash"): string | null {
  if (typeof raw !== "string" || !raw.trim()) {
    return `${fieldName} cannot be empty.`;
  }
  const norm = normalizeHash(raw);
  if (norm.length !== 64) {
    return `${fieldName} must be exactly 64 hexadecimal characters (currently ${norm.length}).`;
  }
  if (!/^[0-9a-f]{64}$/.test(norm)) {
    const invalidChars = norm.replace(/[0-9a-f]/g, "");
    return `${fieldName} contains invalid characters (${invalidChars.slice(0, 5)}). Only 0-9 and a-f are permitted.`;
  }
  return null;
}

/**
 * Compares two SHA-256 hash strings with whitespace normalization and case-insensitivity.
 */
export function compareHashStrings(hashA: string, hashB: string): {
  isMatch: boolean;
  match: boolean;
  valid: boolean;
  isValidA: boolean;
  isValidB: boolean;
  errorA: string | null;
  errorB: string | null;
  error: string | null;
  normalizedA: string;
  normalizedB: string;
} {
  const errorA = getHashValidationError(hashA, "Hash A");
  const errorB = getHashValidationError(hashB, "Hash B");
  const isValidA = errorA === null;
  const isValidB = errorB === null;
  const valid = isValidA && isValidB;
  const normA = normalizeHash(hashA);
  const normB = normalizeHash(hashB);
  const error = errorA || errorB || null;

  if (!valid) {
    return {
      isMatch: false,
      match: false,
      valid: false,
      isValidA,
      isValidB,
      errorA,
      errorB,
      error,
      normalizedA: normA,
      normalizedB: normB,
    };
  }

  const isMatch = normA === normB;
  return {
    isMatch,
    match: isMatch,
    valid: true,
    isValidA: true,
    isValidB: true,
    errorA: null,
    errorB: null,
    error: null,
    normalizedA: normA,
    normalizedB: normB,
  };
}
