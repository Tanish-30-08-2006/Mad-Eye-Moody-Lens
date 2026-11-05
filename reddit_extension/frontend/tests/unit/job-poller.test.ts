/**
 * tests/unit/job-poller.test.ts – Unit tests for polling with exponential backoff and checkpointing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  pollJobUntilComplete,
  getDefaultTimeoutForMediaType,
  DEFAULT_TIMEOUTS_BY_MEDIA_TYPE,
} from '../../src/background/job-poller';
import * as apiClient from '../../src/core/api-client';
import type { DetectionJob } from '../../src/core/schema';

describe('Job Poller', () => {
  const sessionStorageMock = new Map<string, unknown>();

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorageMock.clear();

    // Mock chrome.storage.session
    (global as unknown as { chrome: unknown }).chrome = {
      storage: {
        session: {
          set: vi.fn(async (items: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(items)) {
              sessionStorageMock.set(k, v);
            }
          }),
          get: vi.fn(async (key: string | null) => {
            if (key === null) {
              return Object.fromEntries(sessionStorageMock.entries());
            }
            return { [key]: sessionStorageMock.get(key) };
          }),
          remove: vi.fn(async (key: string) => {
            sessionStorageMock.delete(key);
          }),
        },
      },
    };
  });

  it('polls until job reaches completed status and clears session storage', async () => {
    const pendingJob: DetectionJob = {
      job_id: 'test-job-1',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const completedJob: DetectionJob = {
      job_id: 'test-job-1',
      status: 'completed',
      overall_score: 0.25,
      label: 'likely_real',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const getJobStatusMock = vi
      .spyOn(apiClient, 'getJobStatus')
      .mockResolvedValueOnce(pendingJob)
      .mockResolvedValueOnce(completedJob);

    const result = await pollJobUntilComplete('test-job-1', {
      initialDelayMs: 10,
      maxDelayMs: 20,
      backoffFactor: 1.5,
      timeoutMs: 1000,
      postId: 'post_123',
    });

    expect(result.status).toBe('completed');
    expect(result.label).toBe('likely_real');
    expect(getJobStatusMock).toHaveBeenCalledTimes(2);

    // Final state should be cleared from session storage
    expect(sessionStorageMock.has('in_flight_job:test-job-1')).toBe(false);
  });

  it('throws PollerError when job transitions to failed', async () => {
    const failedJob: DetectionJob = {
      job_id: 'test-job-2',
      status: 'failed',
      error: 'Model inference error',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.spyOn(apiClient, 'getJobStatus').mockResolvedValue(failedJob);

    await expect(
      pollJobUntilComplete('test-job-2', {
        initialDelayMs: 10,
        timeoutMs: 500,
      }),
    ).rejects.toMatchObject({
      code: 'FAILED',
      message: 'Model inference error',
    });

    expect(sessionStorageMock.has('in_flight_job:test-job-2')).toBe(false);
  });

  it('throws PollerError with TIMEOUT when max duration exceeded', async () => {
    const pendingJob: DetectionJob = {
      job_id: 'test-job-3',
      status: 'processing',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.spyOn(apiClient, 'getJobStatus').mockResolvedValue(pendingJob);

    await expect(
      pollJobUntilComplete('test-job-3', {
        initialDelayMs: 50,
        timeoutMs: 120, // Short timeout
      }),
    ).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('aborts polling immediately when AbortSignal triggers', async () => {
    const pendingJob: DetectionJob = {
      job_id: 'test-job-4',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.spyOn(apiClient, 'getJobStatus').mockResolvedValue(pendingJob);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);

    await expect(
      pollJobUntilComplete('test-job-4', {
        initialDelayMs: 100,
        timeoutMs: 2000,
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: 'ABORTED',
    });
  });

  it('provides media-type specific default poller timeouts', () => {
    expect(getDefaultTimeoutForMediaType('image')).toBe(60_000);
    expect(getDefaultTimeoutForMediaType('video')).toBe(300_000);
    expect(getDefaultTimeoutForMediaType('audio')).toBe(120_000);
    expect(getDefaultTimeoutForMediaType(undefined)).toBe(60_000);
    expect(DEFAULT_TIMEOUTS_BY_MEDIA_TYPE.video).toBeGreaterThanOrEqual(300_000);
  });
});
