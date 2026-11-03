/**
 * core/api-client.ts – Typed HTTP client for the Moody Lens backend.
 *
 * Runs strictly in the service worker context. Validates all responses with
 * Zod schemas from schema.ts. Emits typed errors for network failures,
 * HTTP error statuses, and schema mismatches.
 */

import {
  DetectResponseSchema,
  DetectionJobSchema,
  HealthResponseSchema,
  ApiErrorSchema,
  type DetectResponse,
  type DetectionJob,
  type HealthResponse,
} from './schema';
import { loadSettings } from './settings';
import { createLogger } from './logger';

const log = createLogger('api-client');

export const DEFAULT_API_BASE = 'http://localhost:8000';

// ── Typed Error Classes ─────────────────────────────────────────────────────

export type ApiErrorCode =
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'SCHEMA_ERROR'
  | 'TIMEOUT_ERROR'
  | 'NOT_FOUND';

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: ApiErrorCode,
    public readonly status?: number,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/**
 * Retrieve the active backend base URL from synchronized settings.
 */
export async function getApiBaseUrl(): Promise<string> {
  try {
    const settings = await loadSettings();
    return settings.apiUrl || DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

// ── Client Methods ──────────────────────────────────────────────────────────

/**
 * Submit media for asynchronous detection via POST /api/v1/detect.
 */
export async function submitDetection(
  media: Blob,
  audio?: Blob,
  metadata?: { postId: string; permalink: string; mediaType: string },
): Promise<DetectResponse> {
  const baseUrl = await getApiBaseUrl();
  const url = `${baseUrl}/api/v1/detect`;
  log.info(`submitDetection calling ${url}`);

  const formData = new FormData();
  formData.append('media', media, 'media_upload');
  if (audio) {
    formData.append('audio', audio, 'audio_upload');
  }
  if (metadata) {
    formData.append('media_type', metadata.mediaType);
    formData.append('post_id', metadata.postId);
    formData.append('source_url', metadata.permalink);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Client': 'extension',
      },
      body: formData,
    });
  } catch (err) {
    throw new ApiClientError(
      `Failed to connect to backend at ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
      'NETWORK_ERROR',
    );
  }

  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errJson = await res.json();
      const parsedErr = ApiErrorSchema.safeParse(errJson);
      if (parsedErr.success) {
        errorDetail = parsedErr.data.detail || parsedErr.data.error;
      }
    } catch {
      // Body was not JSON
    }
    throw new ApiClientError(
      `Backend returned HTTP ${res.status}: ${errorDetail}`,
      res.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
      res.status,
      errorDetail,
    );
  }

  const rawJson = await res.json();
  const parsed = DetectResponseSchema.safeParse(rawJson);
  if (!parsed.success) {
    throw new ApiClientError(
      `DetectResponse failed schema validation: ${parsed.error.message}`,
      'SCHEMA_ERROR',
      res.status,
      parsed.error.format(),
    );
  }

  return parsed.data;
}

/**
 * Query the status of a detection job via GET /api/v1/jobs/{jobId}.
 */
export async function getJobStatus(jobId: string): Promise<DetectionJob> {
  const baseUrl = await getApiBaseUrl();
  const url = `${baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}`;
  log.debug(`getJobStatus calling ${url}`);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Client': 'extension',
      },
    });
  } catch (err) {
    throw new ApiClientError(
      `Network error querying job ${jobId}: ${err instanceof Error ? err.message : String(err)}`,
      'NETWORK_ERROR',
    );
  }

  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errJson = await res.json();
      const parsedErr = ApiErrorSchema.safeParse(errJson);
      if (parsedErr.success) {
        errorDetail = parsedErr.data.detail || parsedErr.data.error;
      }
    } catch {
      // Body not JSON
    }
    throw new ApiClientError(
      `Failed to retrieve job ${jobId}: HTTP ${res.status} ${errorDetail}`,
      res.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
      res.status,
      errorDetail,
    );
  }

  const rawJson = await res.json();
  const parsed = DetectionJobSchema.safeParse(rawJson);
  if (!parsed.success) {
    throw new ApiClientError(
      `DetectionJob failed schema validation: ${parsed.error.message}`,
      'SCHEMA_ERROR',
      res.status,
      parsed.error.format(),
    );
  }

  return parsed.data;
}

/**
 * Check backend health via GET /api/v1/health.
 */
export async function checkHealth(): Promise<HealthResponse> {
  const baseUrl = await getApiBaseUrl();
  const url = `${baseUrl}/api/v1/health?details=1`;
  log.debug(`checkHealth calling ${url}`);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Client': 'extension',
      },
    });
  } catch (err) {
    throw new ApiClientError(
      `Backend unreachable at ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
      'NETWORK_ERROR',
    );
  }

  if (!res.ok) {
    throw new ApiClientError(
      `Health check returned HTTP ${res.status}`,
      'HTTP_ERROR',
      res.status,
    );
  }

  const rawJson = await res.json();
  const parsed = HealthResponseSchema.safeParse(rawJson);
  if (!parsed.success) {
    throw new ApiClientError(
      `HealthResponse failed schema validation: ${parsed.error.message}`,
      'SCHEMA_ERROR',
      res.status,
      parsed.error.format(),
    );
  }

  return parsed.data;
}

export { DetectResponseSchema, DetectionJobSchema, HealthResponseSchema };
