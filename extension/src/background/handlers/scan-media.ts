/**
 * background/handlers/scan-media.ts – Handler for scan media requests from content scripts.
 *
 * Coordinates media downloading, backend job creation, and background polling.
 *
 * TODO: Implement end-to-end scanning workflow in Phase 3.
 */

import { createLogger } from '../../core/logger';
import type { ScanMediaRequest, ScanMediaResponse } from '../../core/messaging';

const log = createLogger('scan-media-handler');

/**
 * Handle a SCAN_MEDIA message from a content script.
 * TODO: Fetch media bytes, upload to backend, and return job ID in Phase 3.
 */
export async function handleScanMedia(
  request: ScanMediaRequest,
): Promise<ScanMediaResponse> {
  log.info(`Received SCAN_MEDIA for post: ${request.payload.postId} (stub)`);

  // TODO: Phase 3 – Fetch media bytes via media-fetcher.ts
  // TODO: Phase 3 – POST /api/v1/detect to initiate job
  // TODO: Phase 3 – Save job to session storage via keepalive.ts
  // TODO: Phase 3 – Begin polling via job-poller.ts

  return {
    type: 'SCAN_RESULT',
    jobId: `job_stub_${Date.now()}`,
  };
}
