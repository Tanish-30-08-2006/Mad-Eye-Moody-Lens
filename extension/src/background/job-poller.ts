/**
 * background/job-poller.ts – Polling mechanism for asynchronous backend detection jobs.
 *
 * Polls GET /api/v1/jobs/{id} with exponential backoff until the job
 * reaches a terminal status (completed or failed).
 *
 * TODO: Implement backoff loop and timeout controls in Phase 3.
 */

import { createLogger } from '../core/logger';
import type { DetectionJob } from '../core/schema';

const log = createLogger('job-poller');

export interface PollerOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<PollerOptions> = {
  initialDelayMs: 1000,
  maxDelayMs: 4000,
  backoffFactor: 1.5,
  timeoutMs: 60000,
};

/**
 * Poll for job completion with exponential backoff.
 * TODO: Implement in Phase 3 with abort signals.
 */
export async function pollJobUntilComplete(
  jobId: string,
  _options?: PollerOptions,
): Promise<DetectionJob> {
  log.info(`pollJobUntilComplete started for job: ${jobId} (stub)`);
  log.debug('Polling defaults:', DEFAULT_OPTIONS);

  // TODO: Phase 3 – Poll GET /api/v1/jobs/{id} with backoff until completed or failed
  throw new Error('pollJobUntilComplete not implemented – Phase 3');
}
