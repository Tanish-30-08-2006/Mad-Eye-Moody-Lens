/**
 * core/history.ts – Local scan history (chrome.storage.local only).
 *
 * Stores post id, permalink, kind, score, label and time. Never titles, usernames or media URLs.
 */

import { createLogger } from './logger';
import type { Verdict } from './verdict';

const log = createLogger('history');

export const HISTORY_KEY = 'moody_history';
export const MAX_HISTORY_ENTRIES = 1000;

export interface HistoryEntry {
  postId: string;
  permalink: string;
  kind: 'image' | 'gallery' | 'video' | 'gif';
  score: number | null;
  label: Verdict;
  /** Demo data; kept so the history page can never present it as a real result. */
  mock: boolean;
  /** Epoch milliseconds. */
  time: number;
}

function hasStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

export async function getHistory(): Promise<HistoryEntry[]> {
  if (!hasStorage()) return [];
  try {
    const stored = (await chrome.storage.local.get(HISTORY_KEY))[HISTORY_KEY];
    return Array.isArray(stored) ? (stored as HistoryEntry[]) : [];
  } catch (err) {
    log.warn('Could not read history:', err);
    return [];
  }
}

/** Adds (or replaces, per post) an entry; the newest MAX_HISTORY_ENTRIES are kept. */
export async function addHistory(entry: HistoryEntry): Promise<void> {
  if (!hasStorage()) return;
  try {
    const rest = (await getHistory()).filter((e) => e.postId !== entry.postId);
    const next = [entry, ...rest].slice(0, MAX_HISTORY_ENTRIES);
    await chrome.storage.local.set({ [HISTORY_KEY]: next });
  } catch (err) {
    log.warn('Could not save history:', err);
  }
}

export async function clearHistory(): Promise<void> {
  if (!hasStorage()) return;
  try {
    await chrome.storage.local.remove(HISTORY_KEY);
  } catch (err) {
    log.warn('Could not clear history:', err);
  }
}

const CSV_COLUMNS = ['time', 'postId', 'permalink', 'kind', 'score', 'label', 'demo'] as const;

/** Quotes a CSV cell, and neutralises spreadsheet formulas in text fields. */
function csvCell(value: string | number | boolean | null): string {
  let text = value === null ? '' : String(value);
  if (/^[=+\-@]/.test(text) && typeof value === 'string') text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(entries: HistoryEntry[]): string {
  const rows = entries.map((e) =>
    [new Date(e.time).toISOString(), e.postId, e.permalink, e.kind, e.score, e.label, e.mock].map(csvCell).join(','),
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\n');
}

export function toJson(entries: HistoryEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

export type HistorySort = 'time' | 'score' | 'label';

/** Search over permalink, post id and label text; sorted newest/highest first. */
export function filterAndSort(entries: HistoryEntry[], query: string, sort: HistorySort, ascending = false): HistoryEntry[] {
  const q = query.trim().toLowerCase();
  const matches = q
    ? entries.filter((e) => `${e.permalink} ${e.postId} ${e.label.replace('_', ' ')} ${e.kind}`.toLowerCase().includes(q))
    : [...entries];
  const key = (e: HistoryEntry) => (sort === 'time' ? e.time : sort === 'score' ? (e.score ?? -1) : e.label);
  matches.sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    const order = x < y ? -1 : x > y ? 1 : 0;
    return ascending ? order : -order;
  });
  return matches;
}
