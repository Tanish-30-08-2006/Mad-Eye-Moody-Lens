export type HashStatus = "idle" | "hashing" | "done" | "error";

export interface HashedFile {
  id: string;
  file: File;
  hash: string | null;
  status: HashStatus;
  progress: number; // 0 to 1
  error?: string;
  durationMs?: number;
}

export type ComparisonResultType = "match" | "no_match" | "invalid_hash" | "idle";

export interface HashComparisonResult {
  type: ComparisonResultType;
  message: string;
  hashA: string;
  hashB: string;
  isMatch: boolean;
}

export interface FileComparisonResult {
  type: "match" | "no_match" | "error" | "idle";
  message: string;
  fileA?: { name: string; size: number; hash: string };
  fileB?: { name: string; size: number; hash: string };
  isMatch: boolean;
}

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
  generatedAt: string; // ISO 8601 UTC
  generator?: string;
  totalFiles: number;
  totalBytes?: number;
  files: ManifestFileEntry[];
}

export type VerificationStatus =
  | "MATCHED"      // Present in manifest, hash matches
  | "MODIFIED"     // Present in manifest with matching filename, but hash differs
  | "MISSING"      // Present in manifest, but not provided in uploaded files
  | "UNEXPECTED"   // Uploaded file not present in manifest
  | "INVALID";     // Malformed entry or invalid hash format

export interface ManifestVerificationItem {
  id: string;
  filename: string;
  expectedSize?: number;
  actualSize?: number;
  expectedHash?: string;
  actualHash?: string;
  status: VerificationStatus;
  details: string;
}

export interface ManifestVerificationSummary {
  totalExpected: number;
  totalUploaded: number;
  matchedCount: number;
  modifiedCount: number;
  missingCount: number;
  unexpectedCount: number;
  invalidCount: number;
  allMatch: boolean;
  items: ManifestVerificationItem[];
}
