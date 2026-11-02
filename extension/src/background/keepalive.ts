/**
 * background/keepalive.ts – Service worker lifetime management and state persistence.
 *
 * Mitigates MV3 30-second idle termination by maintaining an active port connection
 * during in-flight jobs and saving pending task state into chrome.storage.session.
 *
 * TODO: Implement full port management and state resurrection in Phase 3.
 */

import { createLogger } from '../core/logger';

const log = createLogger('keepalive');

export const KEEPALIVE_PORT_NAME = 'moody-lens-keepalive';

/** Active job session record. */
export interface InFlightJobState {
  jobId: string;
  postId: string;
  startedAt: number;
}

/**
 * Persist an active job identifier into session storage.
 * TODO: Implement in Phase 3.
 */
export async function saveInFlightJob(state: InFlightJobState): Promise<void> {
  log.debug('saveInFlightJob called (stub):', state.jobId);
  // TODO: Phase 3 – chrome.storage.session.set
}

/**
 * Remove a completed or cancelled job from session storage.
 * TODO: Implement in Phase 3.
 */
export async function clearInFlightJob(_jobId: string): Promise<void> {
  log.debug('clearInFlightJob called (stub)');
  // TODO: Phase 3 – chrome.storage.session.remove
}

/**
 * Read all pending in-flight jobs on service worker startup.
 * TODO: Implement in Phase 3.
 */
export async function restoreInFlightJobs(): Promise<InFlightJobState[]> {
  log.debug('restoreInFlightJobs called (stub)');
  // TODO: Phase 3 – Read chrome.storage.session and resume polling
  return [];
}
