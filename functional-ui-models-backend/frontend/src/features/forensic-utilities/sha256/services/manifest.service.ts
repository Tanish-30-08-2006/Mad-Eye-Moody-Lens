/**
 * Manifest parsing, generation, and cryptographic verification service.
 */

export interface ManifestFileEntry {
  filename: string;
  size?: number;
  hash: string;
  sha256?: string;
  lastModified?: string;
}

export interface Sha256Manifest {
  schemaVersion: string;
  algorithm?: string;
  generatedAt: string;
  generator?: string;
  totalFiles: number;
  totalBytes?: number;
  files: ManifestFileEntry[];
}

export type VerificationStatus = "MATCHED" | "MODIFIED" | "MISSING" | "UNEXPECTED" | "INVALID";

export interface ManifestVerificationItem {
  id: string;
  filename: string;
  fileName?: string;
  expectedSize?: number;
  actualSize?: number;
  expectedHash?: string;
  actualHash?: string;
  status: VerificationStatus;
  details: string;
}

export interface ManifestVerificationSummary {
  totalExpected: number;
  totalManifestFiles: number;
  totalUploaded: number;
  totalCandidateFiles: number;
  matchedCount: number;
  modifiedCount: number;
  missingCount: number;
  unexpectedCount: number;
  invalidCount: number;
  allMatch: boolean;
  items: ManifestVerificationItem[];
  results: ManifestVerificationItem[];
  duplicateFilenameWarnings: string[];
}

export interface ManifestInputEntry {
  filename?: string;
  fileName?: string;
  size?: number;
  fileSize?: number;
  hash?: string;
  sha256?: string | null;
}

function normalizeHash(raw: string): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/^0x/i, "").toLowerCase();
}

function isValidSha256(raw: string): boolean {
  const norm = normalizeHash(raw);
  return /^[0-9a-f]{64}$/.test(norm);
}

/**
 * Constructs a standard Sha256Manifest data structure.
 */
export function createManifest(files: ManifestInputEntry[]): Sha256Manifest {
  return {
    schemaVersion: "1.0.0",
    algorithm: "SHA-256",
    generatedAt: new Date().toISOString(),
    generator: "Mad-Eye Moody Lens Forensic Utilities",
    totalFiles: files.length,
    totalBytes: files.reduce((acc, f) => acc + (f.size ?? f.fileSize ?? 0), 0),
    files: files.map((f) => ({
      filename: f.filename ?? f.fileName ?? "unknown",
      size: f.size ?? f.fileSize ?? 0,
      hash: normalizeHash(f.hash ?? f.sha256 ?? ""),
      sha256: normalizeHash(f.hash ?? f.sha256 ?? ""),
    })),
  };
}

/**
 * Validates whether an incoming JSON string conforms to the Sha256Manifest schema.
 */
export function validateManifestJson(jsonString: string): {
  valid: boolean;
  manifest?: Sha256Manifest;
  error?: string;
  duplicateWarning?: string;
} {
  if (!jsonString || !jsonString.trim()) {
    return { valid: false, error: "Manifest JSON string cannot be empty." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    return {
      valid: false,
      error: `Malformed JSON: ${err instanceof Error ? err.message : "Invalid syntax"}`,
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { valid: false, error: "Manifest must be a valid JSON object." };
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.schemaVersion !== "string" || !obj.schemaVersion.startsWith("1.")) {
    return {
      valid: false,
      error: `Unsupported schema version: "${obj.schemaVersion ?? "missing"}". Expected "1.0" or "1.0.0".`,
    };
  }

  if (obj.algorithm && String(obj.algorithm).toUpperCase() !== "SHA-256") {
    return {
      valid: false,
      error: `Unsupported algorithm: "${obj.algorithm}". Expected "SHA-256".`,
    };
  }

  if (!Array.isArray(obj.files)) {
    return { valid: false, error: "Manifest must contain a 'files' array." };
  }

  const seenNames = new Set<string>();
  let duplicateWarning: string | undefined;

  for (let i = 0; i < obj.files.length; i++) {
    const entry = obj.files[i];
    if (typeof entry !== "object" || entry === null) {
      return { valid: false, error: `Invalid entry at index ${i}: not an object.` };
    }
    const rec = entry as Record<string, unknown>;
    const filename = (rec.filename ?? rec.fileName) as string | undefined;
    const hash = (rec.hash ?? rec.sha256) as string | undefined;

    if (typeof filename !== "string" || !filename.trim()) {
      return { valid: false, error: `Entry ${i + 1} is missing a valid 'filename'.` };
    }

    if (typeof hash !== "string" || !hash.trim()) {
      return { valid: false, error: `Entry "${filename}" is missing a SHA-256 hash.` };
    }

    if (!isValidSha256(hash)) {
      return {
        valid: false,
        error: `Entry "${filename}" has an invalid SHA-256 hash (must be 64 hexadecimal characters).`,
      };
    }

    const lowerName = filename.toLowerCase();
    if (seenNames.has(lowerName)) {
      duplicateWarning = `Warning: Manifest contains duplicate file entry "${filename}".`;
    }
    seenNames.add(lowerName);
  }

  const normalizedManifest: Sha256Manifest = {
    schemaVersion: String(obj.schemaVersion),
    algorithm: "SHA-256",
    generatedAt: typeof obj.generatedAt === "string" ? obj.generatedAt : new Date().toISOString(),
    generator: typeof obj.generator === "string" ? obj.generator : "Mad-Eye Moody Lens Forensic Utilities",
    totalFiles: obj.files.length,
    totalBytes: typeof obj.totalBytes === "number" ? obj.totalBytes : 0,
    files: obj.files.map((entry) => {
      const rec = entry as Record<string, unknown>;
      const filename = String(rec.filename ?? rec.fileName ?? "");
      const hash = normalizeHash(String(rec.hash ?? rec.sha256 ?? ""));
      const size = typeof rec.size === "number" ? rec.size : typeof rec.fileSize === "number" ? rec.fileSize : 0;
      return {
        filename,
        size,
        hash,
        sha256: hash,
        lastModified: typeof rec.lastModified === "string" ? rec.lastModified : undefined,
      };
    }),
  };

  return {
    valid: true,
    manifest: normalizedManifest,
    duplicateWarning,
  };
}

export interface UploadedVerifiedFile {
  filename?: string;
  fileName?: string;
  size?: number;
  fileSize?: number;
  hash?: string;
  sha256?: string | null;
  status?: string;
  error?: string;
}

/**
 * Compares a set of candidate files against a validated Sha256Manifest.
 */
export function verifyFilesAgainstManifest(
  manifest: Sha256Manifest,
  uploadedFiles: UploadedVerifiedFile[]
): ManifestVerificationSummary {
  const items: ManifestVerificationItem[] = [];
  const manifestMap = new Map<string, ManifestFileEntry>();
  const duplicateManifestNames = new Set<string>();
  const duplicateWarnings: string[] = [];

  // Index manifest items
  for (const entry of manifest.files) {
    const key = entry.filename.toLowerCase();
    if (manifestMap.has(key)) {
      duplicateManifestNames.add(key);
      duplicateWarnings.push(`Manifest contains duplicate entry for filename: "${entry.filename}"`);
    }
    manifestMap.set(key, entry);
  }

  // Index uploaded files
  const uploadedMap = new Map<string, UploadedVerifiedFile>();
  const duplicateUploadNames = new Set<string>();

  for (const upload of uploadedFiles) {
    const name = upload.filename ?? upload.fileName ?? "";
    const key = name.toLowerCase();
    if (uploadedMap.has(key)) {
      duplicateUploadNames.add(key);
      duplicateWarnings.push(`Uploaded files contain duplicate entry for filename: "${name}"`);
    }
    uploadedMap.set(key, upload);
  }

  let matchedCount = 0;
  let modifiedCount = 0;
  let missingCount = 0;
  let unexpectedCount = 0;
  let invalidCount = 0;

  // 1. Check all entries expected in manifest
  for (const [key, expected] of manifestMap.entries()) {
    const isAmbiguous = duplicateManifestNames.has(key) || duplicateUploadNames.has(key);
    const actual = uploadedMap.get(key);
    const expectedHashNorm = normalizeHash(expected.hash ?? expected.sha256 ?? "");
    const actualHashNorm = actual ? normalizeHash(actual.hash ?? actual.sha256 ?? "") : "";

    if (isAmbiguous) {
      invalidCount++;
      items.push({
        id: `ambig-${key}`,
        filename: expected.filename,
        fileName: expected.filename,
        expectedSize: expected.size,
        actualSize: actual?.size ?? actual?.fileSize,
        expectedHash: expectedHashNorm,
        actualHash: actualHashNorm,
        status: "INVALID",
        details: "Ambiguous match: duplicate filenames detected in manifest or upload set.",
      });
      continue;
    }

    if (!isValidSha256(expectedHashNorm)) {
      invalidCount++;
      items.push({
        id: `invalid-${key}`,
        filename: expected.filename,
        fileName: expected.filename,
        expectedSize: expected.size,
        actualSize: actual?.size ?? actual?.fileSize,
        expectedHash: expectedHashNorm,
        actualHash: actualHashNorm,
        status: "INVALID",
        details: "Manifest record specifies an invalid SHA-256 digest format.",
      });
      continue;
    }

    if (!actual) {
      missingCount++;
      items.push({
        id: `missing-${key}`,
        filename: expected.filename,
        fileName: expected.filename,
        expectedSize: expected.size,
        expectedHash: expectedHashNorm,
        status: "MISSING",
        details: "Expected file was not provided in the verification upload.",
      });
      continue;
    }

    if (actual.status === "error" || actual.error || !isValidSha256(actualHashNorm)) {
      invalidCount++;
      items.push({
        id: `invalid-upload-${key}`,
        filename: expected.filename,
        fileName: expected.filename,
        expectedSize: expected.size,
        actualSize: actual.size ?? actual.fileSize,
        expectedHash: expectedHashNorm,
        actualHash: actualHashNorm,
        status: "INVALID",
        details: actual.error || "File could not be hashed or has an invalid digest.",
      });
      continue;
    }

    // Both present and valid, compare hashes
    if (expectedHashNorm === actualHashNorm) {
      matchedCount++;
      items.push({
        id: `match-${key}`,
        filename: expected.filename,
        fileName: expected.filename,
        expectedSize: expected.size,
        actualSize: actual.size ?? actual.fileSize,
        expectedHash: expectedHashNorm,
        actualHash: actualHashNorm,
        status: "MATCHED",
        details: "Integrity verified: SHA-256 fingerprint matches manifest exactly.",
      });
    } else {
      modifiedCount++;
      items.push({
        id: `mod-${key}`,
        filename: expected.filename,
        fileName: expected.filename,
        expectedSize: expected.size,
        actualSize: actual.size ?? actual.fileSize,
        expectedHash: expectedHashNorm,
        actualHash: actualHashNorm,
        status: "MODIFIED",
        details: "Hash mismatch: file contents have been altered or corrupted.",
      });
    }
  }

  // 2. Check for unexpected files in upload set
  for (const [key, upload] of uploadedMap.entries()) {
    if (!manifestMap.has(key)) {
      const name = upload.filename ?? upload.fileName ?? key;
      const actualHashNorm = normalizeHash(upload.hash ?? upload.sha256 ?? "");
      if (upload.status === "error" || upload.error) {
        invalidCount++;
        items.push({
          id: `unexp-invalid-${key}`,
          filename: name,
          fileName: name,
          actualSize: upload.size ?? upload.fileSize,
          actualHash: actualHashNorm,
          status: "INVALID",
          details: upload.error || "Untracked file failed during hashing.",
        });
      } else {
        unexpectedCount++;
        items.push({
          id: `unexp-${key}`,
          filename: name,
          fileName: name,
          actualSize: upload.size ?? upload.fileSize,
          actualHash: actualHashNorm,
          status: "UNEXPECTED",
          details: "File was uploaded for verification but is not registered in the manifest.",
        });
      }
    }
  }

  const allMatch =
    matchedCount === manifest.files.length &&
    modifiedCount === 0 &&
    missingCount === 0 &&
    unexpectedCount === 0 &&
    invalidCount === 0;

  return {
    totalExpected: manifest.files.length,
    totalManifestFiles: manifest.files.length,
    totalUploaded: uploadedFiles.length,
    totalCandidateFiles: uploadedFiles.length,
    matchedCount,
    modifiedCount,
    missingCount,
    unexpectedCount,
    invalidCount,
    allMatch,
    items,
    results: items,
    duplicateFilenameWarnings: duplicateWarnings,
  };
}
