/**
 * Client-side SHA-256 hashing service using the standard Web Crypto API.
 * Files are processed purely within browser memory; no data is transmitted over the network.
 */

export const MAX_BROWSER_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB browser limit

/**
 * Converts an ArrayBuffer to a 64-character lowercase hexadecimal string.
 */
export function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Computes the SHA-256 hash of an arbitrary ArrayBuffer or Uint8Array.
 */
export async function computeBufferHash(data: ArrayBuffer | Uint8Array): Promise<string> {
  const cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error("Web Crypto API (crypto.subtle) is not supported in this environment.");
  }
  const source = (data instanceof Uint8Array ? data : new Uint8Array(data)) as unknown as BufferSource;
  const digestBuffer = await cryptoObj.subtle.digest("SHA-256", source);
  return bufferToHex(digestBuffer);
}

/**
 * Computes the SHA-256 hash of a plain text string.
 */
export async function hashText(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  return computeBufferHash(encoded);
}

/**
 * Hashes an arbitrary File or Blob object using browser memory with progress and cancellation support.
 */
export async function hashFile(
  file: File | Blob,
  options?: {
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  }
): Promise<string> {
  if (options?.signal?.aborted) {
    throw new DOMException("Hashing operation was cancelled.", "AbortError");
  }

  // Handle empty file explicitly
  if (file.size === 0) {
    options?.onProgress?.(1);
    return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  }

  // Safety check on file size
  if (file.size > MAX_BROWSER_FILE_SIZE) {
    throw new Error(
      `File exceeds the 1 GB client-side browser memory limit (${(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB).`
    );
  }

  // If reading in chunks to provide visual progress on medium/large files
  const chunkSize = 2 * 1024 * 1024; // 2 MB progress slices
  if (options?.onProgress && file.size > chunkSize) {
    const totalChunks = Math.ceil(file.size / chunkSize);
    for (let c = 0; c < totalChunks; c++) {
      if (options.signal?.aborted) {
        throw new DOMException("Hashing operation was cancelled.", "AbortError");
      }
      options.onProgress(c / totalChunks);
      // Yield to allow UI redraw
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const arrayBuffer = await file.arrayBuffer();
  if (options?.signal?.aborted) {
    throw new DOMException("Hashing operation was cancelled.", "AbortError");
  }

  const hash = await computeBufferHash(arrayBuffer);
  options?.onProgress?.(1);
  return hash;
}
