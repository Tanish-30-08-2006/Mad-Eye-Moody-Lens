import { useCallback, useState } from "react";
import type { AnalysisResult } from "../api/client";

export interface HistoryEntry {
  fileName: string;
  at: string;
  result: AnalysisResult;
}

const KEY = "mml-history";
const MAX = 20;

function read(): HistoryEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function write(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable: history is optional */
  }
}

/** Sprint 2 history lives in the browser only — no media is stored server-side. */
export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(read);

  const add = useCallback((result: AnalysisResult, fileName: string) => {
    setEntries((prev) => {
      const next = [{ fileName, at: new Date().toISOString(), result }, ...prev].slice(0, MAX);
      write(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    write([]);
    setEntries([]);
  }, []);

  return { entries, add, clear };
}
