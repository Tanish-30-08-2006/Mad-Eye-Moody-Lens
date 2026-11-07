/**
 * tests/unit/cache.test.ts – Unit tests for local detection result caching with TTL,
 * normalization, model_versions validation, and max-entries capacity eviction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCachedResult,
  setCachedResult,
  clearCache,
  hashUrl,
  makeCacheKey,
  normalizeMediaUrl,
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
    model_versions: {
      image: '1.0.0',
    },
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

  it('normalizes media URLs before hashing (strips tracking, lowercases host, sorts query params)', () => {
    const dirtyUrl = 'HTTPS://I.REDD.IT/photo.png?utm_source=reddit&b=2&ref=share&a=1#fragment';
    const cleanUrl = 'https://i.redd.it/photo.png?a=1&b=2';

    const normalizedDirty = normalizeMediaUrl(dirtyUrl);
    const normalizedClean = normalizeMediaUrl(cleanUrl);

    expect(normalizedDirty).toBe('https://i.redd.it/photo.png?a=1&b=2');
    expect(normalizedDirty).toBe(normalizedClean);
    expect(hashUrl(dirtyUrl)).toBe(hashUrl(cleanUrl));
  });

  it('stores and retrieves an unexpired cached result', async () => {
    await setCachedResult('post_100', 'https://i.redd.it/test.png', dummyJob, 60000);

    const hit = await getCachedResult('post_100', 'https://i.redd.it/test.png');
    expect(hit).not.toBeNull();
    expect(hit?.jobId).toBe('job-cache-123');
    expect(hit?.result.overall_score).toBe(0.15);
  });

  it('validates model_versions: returns entry on match, evicts on mismatch', async () => {
    await setCachedResult('post_ver_check', 'https://i.redd.it/model.png', dummyJob, 60000);

    // Matching version should hit
    const hit = await getCachedResult('post_ver_check', 'https://i.redd.it/model.png', {
      image: '1.0.0',
    });
    expect(hit).not.toBeNull();
    expect(hit?.jobId).toBe('job-cache-123');

    // Mismatched version should evict and return null
    const miss = await getCachedResult('post_ver_check', 'https://i.redd.it/model.png', {
      image: '2.0.0',
    });
    expect(miss).toBeNull();

    // Verify key was evicted from storage
    const key = makeCacheKey('post_ver_check', 'https://i.redd.it/model.png');
    expect(localStorageMock.has(key)).toBe(false);
  });

  it('evicts oldest entries when capacity exceeds maxEntries', async () => {
    const jobA: DetectionJob = { ...dummyJob, job_id: 'job-a' };
    const jobB: DetectionJob = { ...dummyJob, job_id: 'job-b' };
    const jobC: DetectionJob = { ...dummyJob, job_id: 'job-c' };

    // Max capacity = 2 entries
    await setCachedResult('post_A', 'https://i.redd.it/a.png', jobA, 60000, 2);
    // Slight delay to ensure distinct cachedAt timestamps
    await new Promise((r) => setTimeout(r, 10));
    await setCachedResult('post_B', 'https://i.redd.it/b.png', jobB, 60000, 2);

    expect(localStorageMock.size).toBe(2);

    // Adding 3rd should evict oldest (post_A)
    await new Promise((r) => setTimeout(r, 10));
    await setCachedResult('post_C', 'https://i.redd.it/c.png', jobC, 60000, 2);

    expect(localStorageMock.size).toBe(2);
    const hitA = await getCachedResult('post_A', 'https://i.redd.it/a.png');
    const hitB = await getCachedResult('post_B', 'https://i.redd.it/b.png');
    const hitC = await getCachedResult('post_C', 'https://i.redd.it/c.png');

    expect(hitA).toBeNull(); // Evicted
    expect(hitB).not.toBeNull();
    expect(hitC).not.toBeNull();
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
