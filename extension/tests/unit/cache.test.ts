/**
 * tests/unit/cache.test.ts – Unit tests for local detection result caching with TTL.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCachedResult,
  setCachedResult,
  clearCache,
  hashUrl,
  makeCacheKey,
} from '../../src/core/cache';
import type { DetectionJob } from '../../src/core/schema';

describe('Result Cache', () => {
  const localStorageMock = new Map<string, unknown>();

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorageMock.clear();

    (global as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: {
          set: vi.fn(async (items: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(items)) {
              localStorageMock.set(k, v);
            }
          }),
          get: vi.fn(async (key: string | null) => {
            if (key === null) {
              return Object.fromEntries(localStorageMock.entries());
            }
            return { [key]: localStorageMock.get(key) };
          }),
          remove: vi.fn(async (keys: string | string[]) => {
            const arr = Array.isArray(keys) ? keys : [keys];
            for (const k of arr) {
              localStorageMock.delete(k);
            }
          }),
        },
      },
    };
  });

  const dummyJob: DetectionJob = {
    job_id: 'job-cache-123',
    status: 'completed',
    overall_score: 0.15,
    label: 'likely_real',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('generates consistent hashes and cache keys', () => {
    const url = 'https://i.redd.it/example.jpg';
    const hash1 = hashUrl(url);
    const hash2 = hashUrl(url);
    expect(hash1).toBe(hash2);
    expect(makeCacheKey('post_1', url)).toContain('post_1:');
  });

  it('stores and retrieves an unexpired cached result', async () => {
    await setCachedResult('post_100', 'https://i.redd.it/test.png', dummyJob, 60000);

    const hit = await getCachedResult('post_100', 'https://i.redd.it/test.png');
    expect(hit).not.toBeNull();
    expect(hit?.jobId).toBe('job-cache-123');
    expect(hit?.result.overall_score).toBe(0.15);
  });

  it('returns null on cache miss', async () => {
    const miss = await getCachedResult('unknown_post', 'https://i.redd.it/none.png');
    expect(miss).toBeNull();
  });

  it('evicts and returns null for expired cache entry', async () => {
    // Set with negative TTL (already expired)
    await setCachedResult('post_expired', 'https://i.redd.it/exp.png', dummyJob, -1000);

    const expiredHit = await getCachedResult('post_expired', 'https://i.redd.it/exp.png');
    expect(expiredHit).toBeNull();

    // Key should have been evicted
    const key = makeCacheKey('post_expired', 'https://i.redd.it/exp.png');
    expect(localStorageMock.has(key)).toBe(false);
  });

  it('clears all cached entries on clearCache()', async () => {
    await setCachedResult('post_1', 'https://i.redd.it/1.png', dummyJob, 60000);
    await setCachedResult('post_2', 'https://i.redd.it/2.png', dummyJob, 60000);

    expect(localStorageMock.size).toBe(2);
    await clearCache();
    expect(localStorageMock.size).toBe(0);
  });
});
