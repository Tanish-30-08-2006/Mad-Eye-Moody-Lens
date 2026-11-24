/**
 * Image inspection service for extracting binary headers and natural dimensions.
 */

import { validateImageFile, FileValidationResult } from "../utils/file-validation";
import { calculateAspectRatio } from "../utils/metadata-normalizer";

export interface ImageInspectionResult {
  validation: FileValidationResult;
  width: number | null;
  height: number | null;
  aspectRatio: string | null;
  previewUrl: string | null;
}

/**
 * Reads the first 32 bytes of a file to sniff magic bytes without loading the whole file into memory.
 */
export async function readHeaderBytes(file: File | Blob): Promise<Uint8Array> {
  const slice = file.slice(0, 32);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Loads natural image dimensions using a temporary Image element in the browser.
 */
export function getImageDimensions(objectUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof Image === "undefined") {
      resolve({ width: 0, height: 0 });
      return;
    }
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      reject(new Error("Failed to decode image dimensions."));
    };
    img.src = objectUrl;
  });
}

/**
 * Complete inspection of an uploaded image file.
 */
export async function inspectImageFile(file: File): Promise<ImageInspectionResult> {
  const headerBytes = await readHeaderBytes(file);
  const validation = validateImageFile(file, headerBytes);

  if (!validation.valid) {
    return {
      validation,
      width: null,
      height: null,
      aspectRatio: null,
      previewUrl: null,
    };
  }

  let previewUrl: string | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let aspectRatio: string | null = null;

  if (typeof window !== "undefined" && typeof URL !== "undefined") {
    try {
      previewUrl = URL.createObjectURL(file);
      const dims = await getImageDimensions(previewUrl);
      width = dims.width;
      height = dims.height;
      aspectRatio = calculateAspectRatio(dims.width, dims.height);
    } catch {
      // Non-fatal if dimension decode fails
    }
  }

  return {
    validation,
    width,
    height,
    aspectRatio,
    previewUrl,
  };
}
