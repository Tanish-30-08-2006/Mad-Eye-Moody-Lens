/**
 * core/cache.ts – Result caching for scanned media posts.
 *
 * Persists detection verdicts in chrome.storage.local keyed by postId and a media URL hash.
 * Includes TTL expiration (default 1 hour) to ensure stale results are evicted.
 */

import { createLogger } from './logger';
import type { DetectionJob } from './schema';

const log = createLogger('cache');

const CACHE_KEY_PREFIX = 'moody_cache:';
export const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface CacheEntry {
  jobId: string;
  postId: string;
  mediaHash: string;
  result: DetectionJob;
  cachedAt: number;
  expiresAt: number;
}

/**
 * Deterministic hash of a media URL string.
 */
export function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
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
 * Retrieve cached detection result if present and unexpired.
 */
export async function getCachedResult(
  postId: string,
  mediaUrl: string,
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

      log.debug(`Cache hit for post: ${postId}`);
      return entry;
    }
  } catch (err) {
    log.warn('Error reading from storage cache:', err);
  }
  return null;
}

/**
 * Store a detection result in the local storage cache with TTL.
 */
export async function setCachedResult(
  postId: string,
  mediaUrl: string,
  result: DetectionJob,
  ttlMs: number = DEFAULT_CACHE_TTL_MS,
): Promise<void> {
  const key = makeCacheKey(postId, mediaUrl);
  const now = Date.now();
  const entry: CacheEntry = {
    jobId: result.job_id,
    postId,
    mediaHash: hashUrl(mediaUrl),
    result,
    cachedAt: now,
    expiresAt: now + ttlMs,
  };

  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
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
