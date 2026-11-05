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
  BrainStatusSchema,
  ApiErrorSchema,
  type BrainStatus,
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
    /** Machine-readable `code` from the backend error body, if any. */
    public readonly backendCode?: string,
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

/** Reads the backend's error body (if JSON) into a message and code. */
async function readErrorBody(res: Response): Promise<{ message: string; code?: string }> {
  try {
    const parsed = ApiErrorSchema.safeParse(await res.json());
    if (parsed.success) {
      return { message: parsed.data.detail || parsed.data.error, code: parsed.data.code ?? undefined };
    }
  } catch {
    // Body was not JSON
  }
  return { message: res.statusText };
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
    const body = await readErrorBody(res);
    throw new ApiClientError(
      `Backend returned HTTP ${res.status}: ${body.message}`,
      res.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
      res.status,
      body.message,
      body.code,
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
 * Tier-2 fallback: ask the backend to download a Reddit post's video itself (POST /api/v1/detect-url).
 * Only used when the server-fallback setting is on.
 */
export async function submitDetectUrl(url: string, mediaType: 'video' | 'image' = 'video'): Promise<DetectResponse> {
  const baseUrl = await getApiBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1/detect-url`, {
      method: 'POST',
      headers: { 'X-Client': 'extension', 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, media_type: mediaType }),
    });
  } catch (err) {
    throw new ApiClientError(
      `Failed to connect to backend at ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
      'NETWORK_ERROR',
    );
  }

  if (!res.ok) {
    const body = await readErrorBody(res);
    throw new ApiClientError(
      `detect-url returned HTTP ${res.status}: ${body.message}`,
      res.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
      res.status,
      body.message,
      body.code,
    );
  }

  const parsed = DetectResponseSchema.safeParse(await res.json());
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
    const body = await readErrorBody(res);
    throw new ApiClientError(
      `Failed to retrieve job ${jobId}: HTTP ${res.status} ${body.message}`,
      res.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
      res.status,
      body.message,
      body.code,
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

/** One fetch to the backend with the standard error mapping; `parse` validates the JSON body. */
async function request<T>(path: string, init: RequestInit, parse: (json: unknown) => T | null, what: string): Promise<T> {
  const baseUrl = await getApiBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, { ...init, headers: { 'X-Client': 'extension', ...init.headers } });
  } catch (err) {
    throw new ApiClientError(
      `Failed to connect to backend at ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
      'NETWORK_ERROR',
    );
  }
  if (!res.ok) {
    const body = await readErrorBody(res);
    throw new ApiClientError(
      `${what} returned HTTP ${res.status}: ${body.message}`,
      res.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
      res.status,
      body.message,
      body.code,
    );
  }
  const parsed = parse(await res.json());
  if (parsed === null) throw new ApiClientError(`${what} failed schema validation`, 'SCHEMA_ERROR', res.status);
  return parsed;
}

/** Up to 10 gallery images as ONE job (POST /api/v1/detect/batch). */
export async function submitBatch(
  images: Blob[],
  metadata: { postId: string; permalink: string },
): Promise<DetectResponse> {
  const form = new FormData();
  images.forEach((blob, i) => form.append('media', blob, `image_${i}`));
  form.append('post_id', metadata.postId);
  form.append('source_url', metadata.permalink);
  return request('/api/v1/detect/batch', { method: 'POST', body: form }, (j) => {
    const r = DetectResponseSchema.safeParse(j);
    return r.success ? r.data : null;
  }, 'detect/batch');
}

/** Previous verdict for identical bytes (GET /api/v1/verdicts/lookup); null on a miss or any failure. */
export async function lookupVerdict(sha256: string): Promise<DetectionJob | null> {
  try {
    return await request(`/api/v1/verdicts/lookup?sha256=${encodeURIComponent(sha256)}`, { method: 'GET' }, (j) => {
      const r = DetectionJobSchema.safeParse(j);
      return r.success ? r.data : null;
    }, 'verdicts/lookup');
  } catch (err) {
    log.debug('Hash lookup failed or missed:', err instanceof ApiClientError ? err.code : '');
    return null;
  }
}

/** Thumbs up/down (POST /api/v1/feedback): cache key and labels only. */
export async function sendFeedback(feedback: { cacheKey: string; verdictLabel: string; userLabel: string }): Promise<void> {
  await request('/api/v1/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cache_key: feedback.cacheKey, verdict_label: feedback.verdictLabel, user_label: feedback.userLabel }),
  }, (j) => j as unknown, 'feedback');
}

/** Which brain answers scans, and whether it is a demo (GET /api/v1/brain/status). */
export async function getBrainStatus(): Promise<BrainStatus> {
  return request('/api/v1/brain/status', { method: 'GET' }, (j) => {
    const r = BrainStatusSchema.safeParse(j);
    return r.success ? r.data : null;
  }, 'brain/status');
}

export { DetectResponseSchema, DetectionJobSchema, HealthResponseSchema };
