import { useCallback, useRef, useState } from "react";
import { hashFile } from "../services/sha256.service";
import { HashedFile } from "../types/sha256.types";

export function useSha256() {
  const [files, setFiles] = useState<HashedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const addFiles = useCallback((incoming: File[]) => {
    if (!incoming || incoming.length === 0) return;
    setFiles((prev) => {
      const added: HashedFile[] = incoming.map((file, idx) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        hash: null,
        status: "idle",
        progress: 0,
      }));
      return [...prev, ...added];
    });
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setFiles([]);
    setIsProcessing(false);
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
    setFiles((prev) =>
      prev.map((f) => (f.status === "hashing" ? { ...f, status: "idle", progress: 0 } : f))
    );
  }, []);

  const hashSingle = useCallback(async (id: string) => {
    const target = files.find((f) => f.id === id);
    if (!target) return;

    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: "hashing", progress: 0, error: undefined } : f))
    );

    const startTime = performance.now();
    try {
      const hash = await hashFile(target.file, {
        onProgress: (fraction) => {
          setFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, progress: fraction } : f))
          );
        },
      });
      const durationMs = Math.round(performance.now() - startTime);
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, hash, status: "done", progress: 1, durationMs } : f))
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : "Failed to hash file.";
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: "error", error } : f))
      );
    }
  }, [files]);

  const hashAll = useCallback(async () => {
    if (isProcessing) return;
    const pending = files.filter((f) => f.status !== "done");
    if (pending.length === 0) return;

    setIsProcessing(true);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Process files with concurrency limit 2 to avoid UI jank
    const CONCURRENCY = 2;
    const queue = [...pending];

    const worker = async () => {
      while (queue.length > 0) {
        if (signal.aborted) break;
        const item = queue.shift();
        if (!item) break;

        setFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: "hashing", progress: 0, error: undefined } : f))
        );

        const startTime = performance.now();
        try {
          const hash = await hashFile(item.file, {
            onProgress: (fraction) => {
              setFiles((prev) =>
                prev.map((f) => (f.id === item.id ? { ...f, progress: fraction } : f))
              );
            },
            signal,
          });
          const durationMs = Math.round(performance.now() - startTime);
          setFiles((prev) =>
            prev.map((f) => (f.id === item.id ? { ...f, hash, status: "done", progress: 1, durationMs } : f))
          );
        } catch (err) {
          if (signal.aborted) return;
          const error = err instanceof Error ? err.message : "Failed to hash file.";
          setFiles((prev) =>
            prev.map((f) => (f.id === item.id ? { ...f, status: "error", error } : f))
          );
        }
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker());
    await Promise.all(workers);

    setIsProcessing(false);
    abortControllerRef.current = null;
  }, [files, isProcessing]);

  return {
    files,
    isProcessing,
    addFiles,
    removeFile,
    clearFiles,
    hashSingle,
    hashAll,
    cancel,
  };
}
