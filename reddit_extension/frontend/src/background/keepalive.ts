/**
 * background/keepalive.ts – Service worker lifetime management and session persistence.
 *
 * MV3 service workers can be terminated after 30 seconds of inactivity.
 * This module mitigates premature worker shutdowns by:
 * 1. Maintaining keepalive heartbeats / port connections during active jobs.
 * 2. Persisting in-flight job records in chrome.storage.session so they can be
 *    resumed seamlessly if the worker is recycled.
 */

import { createLogger } from '../core/logger';

const log = createLogger('keepalive');

export const KEEPALIVE_PORT_NAME = 'moody-lens-keepalive';
const IN_FLIGHT_PREFIX = 'in_flight_job:';

export interface InFlightJobState {
  jobId: string;
  postId: string;
  mediaType: string;
  startedAt: number;
  lastPolledAt: number;
  currentDelayMs: number;
}

let activeKeepaliveTimer: ReturnType<typeof setInterval> | null = null;
let activeJobCount = 0;

/**
 * Start periodic keepalive heartbeat to prevent MV3 worker idling during jobs.
 */
export function startKeepalive(): void {
  activeJobCount++;
  if (activeKeepaliveTimer !== null) {
    return;
  }

  log.debug('Starting keepalive heartbeat loop');
  // Ping chrome.runtime.getPlatformInfo or storage every 20s to keep event loop busy
  activeKeepaliveTimer = setInterval(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getPlatformInfo) {
      chrome.runtime.getPlatformInfo(() => {
        // Heartbeat tick
      });
    }
  }, 20000);
}

/**
 * Stop keepalive heartbeat when no active jobs remain.
 */
export function stopKeepalive(): void {
  activeJobCount = Math.max(0, activeJobCount - 1);
  if (activeJobCount === 0 && activeKeepaliveTimer !== null) {
    log.debug('Stopping keepalive heartbeat loop (all jobs complete)');
    clearInterval(activeKeepaliveTimer);
    activeKeepaliveTimer = null;
  }
}

/**
 * Persist an active in-flight job state into session storage.
 */
export async function saveInFlightJob(state: InFlightJobState): Promise<void> {
  const key = `${IN_FLIGHT_PREFIX}${state.jobId}`;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      await chrome.storage.session.set({ [key]: state });
      log.debug(`Saved in-flight job to session storage: ${state.jobId}`);
    }
  } catch (err) {
    log.warn(`Failed to save in-flight job state for ${state.jobId}:`, err);
  }
}

/**
 * Remove an in-flight job record from session storage on completion or failure.
 */
export async function clearInFlightJob(jobId: string): Promise<void> {
  const key = `${IN_FLIGHT_PREFIX}${jobId}`;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      await chrome.storage.session.remove(key);
      log.debug(`Cleared in-flight job from session storage: ${jobId}`);
    }
  } catch (err) {
    log.warn(`Failed to clear in-flight job state for ${jobId}:`, err);
  }
}

/**
 * Retrieve all in-flight jobs from session storage (called on worker resurrection).
 */
export async function restoreInFlightJobs(): Promise<InFlightJobState[]> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      const allItems = await chrome.storage.session.get(null);
      const jobs: InFlightJobState[] = [];
      for (const [key, val] of Object.entries(allItems)) {
        if (key.startsWith(IN_FLIGHT_PREFIX) && val && typeof val === 'object') {
          jobs.push(val as InFlightJobState);
        }
      }
      log.info(`Restored ${jobs.length} in-flight job(s) from session storage`);
      return jobs;
    }
  } catch (err) {
    log.warn('Failed to restore in-flight jobs from session storage:', err);
  }
  return [];
}
