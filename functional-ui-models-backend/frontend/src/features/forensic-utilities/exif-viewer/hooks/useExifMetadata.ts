/**
 * Hook executing EXIF and metadata extraction from a validated file.
 */

import { useState, useEffect, useCallback } from "react";
import { CompleteImageMetadata } from "../types/metadata.types";
import { SupportedImageFormat } from "../types/exif.types";
import { extractMetadataFromFile } from "../services/metadata-extractor.service";

export interface UseExifMetadataReturn {
  metadata: CompleteImageMetadata | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clear: () => void;
}

export function useExifMetadata(
  file: File | null,
  detectedFormat: SupportedImageFormat,
  width: number | null,
  height: number | null,
  aspectRatio: string | null
): UseExifMetadataReturn {
  const [metadata, setMetadata] = useState<CompleteImageMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extract = useCallback(async () => {
    if (!file) {
      setMetadata(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await extractMetadataFromFile(
        file,
        file.name,
        detectedFormat,
        width,
        height,
        aspectRatio
      );
      setMetadata(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while parsing image metadata."
      );
      setMetadata(null);
    } finally {
      setIsLoading(false);
    }
  }, [file, detectedFormat, width, height, aspectRatio]);

  useEffect(() => {
    extract();
  }, [extract]);

  const clear = useCallback(() => {
    setMetadata(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    metadata,
    isLoading,
    error,
    refresh: extract,
    clear,
  };
}
