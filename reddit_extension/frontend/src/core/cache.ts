/**
 * core/cache.ts – Result caching for scanned media posts.
 *
 * Persists detection verdicts in chrome.storage.local keyed by postId and a media URL hash.
 * Includes TTL expiration (default 1 hour), max-entries capacity eviction (LRU/FIFO),
 * URL normalization before hashing, and model_versions validation.
 */

import { createLogger } from './logger';
import type { DetectionJob } from './schema';
import type { ScanMeta } from './scan-meta';

const log = createLogger('cache');

const CACHE_KEY_PREFIX = 'moody_cache:';
export const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
export const DEFAULT_MAX_CACHE_ENTRIES = 100; // max entries before eviction

export interface CacheEntry {
  jobId: string;
  postId: string;
  mediaHash: string;
  result: DetectionJob;
  /** Extension-side notes (hints, audio note) saved with the verdict. */
  meta?: ScanMeta;
  modelVersions?: Record<string, string> | null;
  cachedAt: number;
  expiresAt: number;
}

/**
 * Normalizes a media URL before hashing:
 * - Trims whitespace
 * - Converts protocol and hostname to lowercase
 * - Strips fragment/hash
 * - Strips tracking query parameters (utm_*, ref, etc.)
 * - Sorts query parameters deterministically
 * - Strips trailing slash on non-root paths
 */
export function normalizeMediaUrl(rawUrl: string): string {
  try {
    const trimmed = rawUrl.trim();
    const parsed = new URL(trimmed);

    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = '';

    const trackingParams = new Set([
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'ref',
      'ref_source',
      'ref_campaign',
    ]);

    const keysToDelete: string[] = [];
    parsed.searchParams.forEach((_, key) => {
      const lower = key.toLowerCase();
      if (trackingParams.has(lower) || lower.startsWith('utm_')) {
        keysToDelete.push(key);
      }
    });
    for (const k of keysToDelete) {
      parsed.searchParams.delete(k);
    }

    parsed.searchParams.sort();
    let normalized = parsed.toString();
    if (normalized.endsWith('/') && parsed.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Deterministic hash of a normalized media URL string.
 */
export function hashUrl(url: string): string {
  const normalized = normalizeMediaUrl(url);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(16);
}

/**
 * Generate a composite storage key for post and media URL.
 */
export function makeCacheKey(postId: string, mediaUrl: string): string {
  return `${CACHE_KEY_PREFIX}${postId}:${hashUrl(mediaUrl)}`;
}

/**
 * Retrieve cached detection result if present, unexpired, and model versions match.
 */
export async function getCachedResult(
  postId: string,
  mediaUrl: string,
  expectedModelVersions?: Record<string, string> | null,
): Promise<CacheEntry | null> {
  const key = makeCacheKey(postId, mediaUrl);
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const items = await chrome.storage.local.get(key);
      const entry: CacheEntry | undefined = items[key];

      if (!entry) {
        return null;
      }

      if (Date.now() > entry.expiresAt) {
        log.debug(`Cache entry for ${postId} expired; evicting.`);
        await chrome.storage.local.remove(key);
        return null;
      }

      // Validate model_versions if expected versions are provided
      if (expectedModelVersions && Object.keys(expectedModelVersions).length > 0) {
        const cachedVersions = entry.modelVersions ?? entry.result.model_versions;
        if (!cachedVersions) {
          log.debug(`Cache entry for ${postId} missing model_versions; evicting.`);
          await chrome.storage.local.remove(key);
          return null;
        }

        for (const [modelKey, expVersion] of Object.entries(expectedModelVersions)) {
          if (cachedVersions[modelKey] !== expVersion) {
            log.debug(
              `Cache entry for ${postId} version mismatch for ${modelKey} (cached: ${cachedVersions[modelKey]}, expected: ${expVersion}); evicting.`,
            );
            await chrome.storage.local.remove(key);
            return null;
          }
        }
      }

      log.debug(`Cache hit for post: ${postId}`);
      return entry;
    }
  } catch (err) {
    log.warn('Error reading from storage cache:', err);
  }
  return null;
}

/**
 * Store a detection result in the local storage cache with TTL and capacity eviction.
 */
export async function setCachedResult(
  postId: string,
  mediaUrl: string,
  result: DetectionJob,
  ttlMs: number = DEFAULT_CACHE_TTL_MS,
  maxEntries: number = DEFAULT_MAX_CACHE_ENTRIES,
  meta?: ScanMeta,
): Promise<void> {
  const key = makeCacheKey(postId, mediaUrl);
  const now = Date.now();
  const entry: CacheEntry = {
    jobId: result.job_id,
    postId,
    mediaHash: hashUrl(mediaUrl),
    result,
    meta,
    modelVersions: result.model_versions ?? null,
    cachedAt: now,
    expiresAt: now + ttlMs,
  };

  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      // Check current capacity and evict oldest if at or exceeding maxEntries
      const all = await chrome.storage.local.get(null);
      const existingEntries: { key: string; cachedAt: number }[] = [];

      for (const [k, v] of Object.entries(all)) {
        if (k.startsWith(CACHE_KEY_PREFIX)) {
          const item = v as CacheEntry;
          existingEntries.push({ key: k, cachedAt: item.cachedAt || 0 });
        }
      }

      if (existingEntries.length >= maxEntries) {
        // Sort oldest cached entries first
        existingEntries.sort((a, b) => a.cachedAt - b.cachedAt);
        const toEvictCount = existingEntries.length - maxEntries + 1;
        const keysToEvict = existingEntries.slice(0, toEvictCount).map((e) => e.key);
        await chrome.storage.local.remove(keysToEvict);
        log.debug(`Evicted ${keysToEvict.length} oldest cache entries to maintain max capacity (${maxEntries}).`);
      }

      await chrome.storage.local.set({ [key]: entry });
      log.debug(`Cached verdict for post: ${postId} (expires in ${ttlMs / 1000}s)`);
    }
  } catch (err) {
    log.warn('Error saving to storage cache:', err);
  }
}

/**
 * Clear all Moody Lens cache entries.
 */
export async function clearCache(): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const all = await chrome.storage.local.get(null);
      const keysToRemove = Object.keys(all).filter((k) => k.startsWith(CACHE_KEY_PREFIX));
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        log.info(`Cleared ${keysToRemove.length} cache entries.`);
      }
    }
  } catch (err) {
    log.warn('Error clearing storage cache:', err);
  }
}
