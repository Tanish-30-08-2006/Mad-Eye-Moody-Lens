/**
 * core/cache.ts – Result caching for scanned posts.
 *
 * Caches detection results by post ID and media hash to avoid redundant scans.
 * Uses chrome.storage.local for persistence across sessions.
 *
 * TODO: Implement cache eviction and size limits in Phase 7.
 */

import { createLogger } from './logger';
import type { DetectionJob } from './schema';

const log = createLogger('cache');

/** Cache entry with TTL metadata. */
export interface CacheEntry {
  jobId: string;
  postId: string;
  result: DetectionJob;
  cachedAt: number;
  expiresAt: number;
}

/** Default cache TTL: 1 hour. */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

/**
 * Get a cached result for a post ID.
 * TODO: Implement in Phase 7.
 */
export async function getCachedResult(
  _postId: string,
): Promise<CacheEntry | null> {
  log.debug('getCachedResult called (stub)');
  // TODO: Read from chrome.storage.local in Phase 7
  return null;
}

/**
 * Store a detection result in the cache.
 * TODO: Implement in Phase 7.
 */
export async function setCachedResult(
  _postId: string,
  _jobId: string,
  _result: DetectionJob,
  _ttl: number = DEFAULT_TTL_MS,
): Promise<void> {
  log.debug('setCachedResult called (stub)');
  // TODO: Write to chrome.storage.local in Phase 7
}

/**
 * Clear all cached results.
 * TODO: Implement in Phase 7.
 */
export async function clearCache(): Promise<void> {
  log.debug('clearCache called (stub)');
  // TODO: Clear chrome.storage.local in Phase 7
}
