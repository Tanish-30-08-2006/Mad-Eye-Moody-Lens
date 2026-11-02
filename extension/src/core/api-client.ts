/**
 * core/api-client.ts – HTTP client for communicating with the Moody Lens backend.
 *
 * Runs ONLY in the service worker context (MV3: content scripts cannot make
 * cross-origin requests). Validates responses with zod schemas from schema.ts.
 *
 * TODO: Implement full request/response cycle in Phase 3.
 */

import {
  DetectResponseSchema,
  DetectionJobSchema,
  HealthResponseSchema,
  type DetectResponse,
  type DetectionJob,
  type HealthResponse,
} from './schema';
import { createLogger } from './logger';

const log = createLogger('api-client');

/** Base URL for the backend API. TODO: Read from settings in Phase 7. */
export const API_BASE = 'http://localhost:8000';

/**
 * Submit media for detection. Returns a job ID for polling.
 * TODO: Implement multipart upload in Phase 3.
 */
export async function submitDetection(
  _media: Blob,
  _audio?: Blob,
  _metadata?: { postId: string; permalink: string; mediaType: string },
): Promise<DetectResponse> {
  log.info('submitDetection called (stub)');
  // TODO: POST /api/v1/detect with FormData in Phase 3
  throw new Error('submitDetection not implemented – Phase 3');
}

/**
 * Poll job status by ID.
 * TODO: Implement with backoff in Phase 3 (job-poller.ts).
 */
export async function getJobStatus(
  _jobId: string,
): Promise<DetectionJob> {
  log.info('getJobStatus called (stub)');
  // TODO: GET /api/v1/jobs/{id} in Phase 3
  throw new Error('getJobStatus not implemented – Phase 3');
}

/**
 * Check backend health.
 * TODO: Implement in Phase 3.
 */
export async function checkHealth(): Promise<HealthResponse> {
  log.info('checkHealth called (stub)');
  // TODO: GET /api/v1/health in Phase 3
  throw new Error('checkHealth not implemented – Phase 3');
}

// Export schema validators for use in tests
export { DetectResponseSchema, DetectionJobSchema, HealthResponseSchema };
