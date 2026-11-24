/**
 * Hook managing image file selection, validation, dimension extraction, and object URL lifecycle.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { SupportedImageFormat } from "../types/exif.types";
import { inspectImageFile, ImageInspectionResult } from "../services/image-inspector.service";

export interface UseImageUploadReturn {
  file: File | null;
  previewUrl: string | null;
  error: string | null;
  width: number | null;
  height: number | null;
  aspectRatio: string | null;
  detectedFormat: SupportedImageFormat;
  isValidating: boolean;
  selectFile: (file: File) => Promise<boolean>;
  removeFile: () => void;
}

export function useImageUpload(): UseImageUploadReturn {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [aspectRatio, setAspectRatio] = useState<string | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<SupportedImageFormat>("UNKNOWN");
  const [isValidating, setIsValidating] = useState(false);

  const previewUrlRef = useRef<string | null>(null);

  // Revoke object URL on unmount or replace to prevent memory leak
  const cleanupUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupUrl();
    };
  }, [cleanupUrl]);

  const selectFile = useCallback(
    async (newFile: File): Promise<boolean> => {
      cleanupUrl();
      setError(null);
      setIsValidating(true);

      try {
        const inspection: ImageInspectionResult = await inspectImageFile(newFile);

        if (!inspection.validation.valid) {
          setError(inspection.validation.error || "Invalid image file.");
          setFile(null);
          setPreviewUrl(null);
          setWidth(null);
          setHeight(null);
          setAspectRatio(null);
          setDetectedFormat("UNKNOWN");
          return false;
        }

        setFile(newFile);
        setPreviewUrl(inspection.previewUrl);
        previewUrlRef.current = inspection.previewUrl;
        setWidth(inspection.width);
        setHeight(inspection.height);
        setAspectRatio(inspection.aspectRatio);
        setDetectedFormat(inspection.validation.detectedFormat);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error validating file.");
        return false;
      } finally {
        setIsValidating(false);
      }
    },
    [cleanupUrl]
  );

  const removeFile = useCallback(() => {
    cleanupUrl();
    setFile(null);
    setPreviewUrl(null);
    setError(null);
    setWidth(null);
    setHeight(null);
    setAspectRatio(null);
    setDetectedFormat("UNKNOWN");
  }, [cleanupUrl]);

  return {
    file,
    previewUrl,
    error,
    width,
    height,
    aspectRatio,
    detectedFormat,
    isValidating,
    selectFile,
    removeFile,
  };
}
