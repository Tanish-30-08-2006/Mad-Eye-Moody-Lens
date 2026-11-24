/**
 * Formatting and export utilities for files and hash results.
 */

export function formatBytes(bytes: number): string {
  if (isNaN(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function getFileExtension(filename: string): string {
  if (!filename) return "UNKNOWN";
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toUpperCase() : "UNKNOWN";
}

export interface ExportableFile {
  filename?: string;
  fileName?: string;
  size?: number;
  fileSize?: number;
  hash?: string;
  sha256?: string | null;
}

/**
 * Builds standard CSV content from calculated hashes.
 */
export function exportHashesToCsv(files: ExportableFile[]): string {
  const header = "Filename,Size (Bytes),Size (Formatted),SHA-256 Hash\r\n";
  const rows = files.map((f) => {
    const name = f.filename ?? f.fileName ?? "unknown";
    const size = f.size ?? f.fileSize ?? 0;
    const hash = f.hash ?? f.sha256 ?? "";
    const escapedName = `"${name.replace(/"/g, '""')}"`;
    return `${escapedName},${size},"${formatBytes(size)}",${hash}`;
  });
  return header + rows.join("\r\n");
}

/**
 * Builds formatted JSON manifest string.
 */
export function exportHashesToJson(files: ExportableFile[]): string {
  const manifest = {
    schemaVersion: "1.0",
    algorithm: "SHA-256",
    generatedAt: new Date().toISOString(),
    generator: "Mad-Eye Moody Lens Forensic Utilities",
    totalFiles: files.length,
    totalBytes: files.reduce((acc, f) => acc + (f.size ?? f.fileSize ?? 0), 0),
    files: files.map((f) => ({
      filename: f.filename ?? f.fileName ?? "unknown",
      size: f.size ?? f.fileSize ?? 0,
      hash: f.hash ?? f.sha256 ?? "",
    })),
  };
  return JSON.stringify(manifest, null, 2);
}

/**
 * Triggers a client-side browser file download for a string blob.
 */
export function triggerDownload(content: string, filename: string, mimeType = "application/json"): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
