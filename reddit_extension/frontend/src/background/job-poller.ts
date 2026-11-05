/**
 * background/job-poller.ts – Polling mechanism with exponential backoff and session checkpointing.
 *
 * Repeatedly queries GET /api/v1/jobs/{id} with exponential backoff until
 * a terminal state (completed or failed) is reached.
 * Checkpoints current polling state into chrome.storage.session at every step.
 */

import { createLogger } from '../core/logger';
import { getJobStatus } from '../core/api-client';
import { saveInFlightJob, clearInFlightJob } from './keepalive';
import type { DetectionJob } from '../core/schema';

const log = createLogger('job-poller');

export interface PollerOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  timeoutMs?: number;
  postId?: string;
  mediaType?: string;
  abortSignal?: AbortSignal;
}

export const DEFAULT_TIMEOUTS_BY_MEDIA_TYPE: Record<string, number> = {
  image: 60_000, // 60s for images
  audio: 120_000, // 2m for audio
  video: 300_000, // 5+ min (300s) for video
};

export function getDefaultTimeoutForMediaType(mediaType?: string): number {
  if (!mediaType) return DEFAULT_TIMEOUTS_BY_MEDIA_TYPE.image;
  return DEFAULT_TIMEOUTS_BY_MEDIA_TYPE[mediaType.toLowerCase()] ?? DEFAULT_POLLER_OPTIONS.timeoutMs;
}

export const DEFAULT_POLLER_OPTIONS: Required<Omit<PollerOptions, 'postId' | 'mediaType' | 'abortSignal'>> = {
  initialDelayMs: 1000,
  maxDelayMs: 8000,
  backoffFactor: 1.5,
  timeoutMs: 60000,
};

export class PollerError extends Error {
  constructor(
    message: string,
    public readonly code: 'TIMEOUT' | 'ABORTED' | 'FAILED',
    public readonly job?: DetectionJob,
  ) {
    super(message);
    this.name = 'PollerError';
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new PollerError('Polling aborted by caller', 'ABORTED'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new PollerError('Polling aborted by caller', 'ABORTED'));
      },
      { once: true },
    );
  });
}

/**
 * Polls for job completion with exponential backoff and session checkpointing.
 */
export async function pollJobUntilComplete(
  jobId: string,
  options: PollerOptions = {},
): Promise<DetectionJob> {
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_POLLER_OPTIONS.initialDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_POLLER_OPTIONS.maxDelayMs;
  const backoffFactor = options.backoffFactor ?? DEFAULT_POLLER_OPTIONS.backoffFactor;
  const postId = options.postId || 'unknown_post';
  const mediaType = options.mediaType || 'image';
  const timeoutMs = options.timeoutMs ?? getDefaultTimeoutForMediaType(mediaType);

  const startTime = Date.now();
  let currentDelay = initialDelayMs;

  log.info(`Started polling for job ${jobId} (timeout: ${timeoutMs}ms)`);

  while (Date.now() - startTime < timeoutMs) {
    if (options.abortSignal?.aborted) {
      await clearInFlightJob(jobId);
      throw new PollerError('Polling aborted', 'ABORTED');
    }

    // 1. Checkpoint state into session storage
    await saveInFlightJob({
      jobId,
      postId,
      mediaType,
      startedAt: startTime,
      lastPolledAt: Date.now(),
      currentDelayMs: currentDelay,
    });

    // 2. Fetch current status
    const job = await getJobStatus(jobId);

    if (job.status === 'completed') {
      log.info(`Job ${jobId} completed successfully (verdict: ${job.label})`);
      await clearInFlightJob(jobId);
      return job;
    }

    if (job.status === 'failed') {
      log.warn(`Job ${jobId} failed with error: ${job.error}`);
      await clearInFlightJob(jobId);
      throw new PollerError(job.error || 'Job failed on backend', 'FAILED', job);
    }

    // 3. Sleep with backoff
    await delay(currentDelay, options.abortSignal);
    currentDelay = Math.min(Math.round(currentDelay * backoffFactor), maxDelayMs);
  }

  await clearInFlightJob(jobId);
  throw new PollerError(`Job ${jobId} timed out after ${timeoutMs}ms`, 'TIMEOUT');
}
