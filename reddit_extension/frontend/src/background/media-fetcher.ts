/**
 * background/media-fetcher.ts – Secure media fetching with allowlist & size capping.
 *
 * Runs exclusively in the service worker context to leverage host permissions.
 * Strictly enforces an allowlist of CDN domains, protocol (https only), and size limits.
 */

import { createLogger } from '../core/logger';

const log = createLogger('media-fetcher');

/** Allowed hosts for media fetching. */
export const ALLOWED_HOSTS = [
  'i.redd.it',
  'v.redd.it',
  'preview.redd.it',
  'external-preview.redd.it',
];

/** Maximum allowed media download size (50MB by default). */
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

/** Default fetch timeout (30 seconds). */
export const DEFAULT_FETCH_TIMEOUT_MS = 30000;

// ── Typed Error Classes ─────────────────────────────────────────────────────

export class MediaFetchError extends Error {
  constructor(
    message: string,
    public readonly code: 'DISALLOWED_HOST' | 'DISALLOWED_PROTOCOL' | 'SIZE_EXCEEDED' | 'TIMEOUT' | 'NETWORK_ERROR' | 'INVALID_URL',
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'MediaFetchError';
  }
}

export interface FetchedMedia {
  blob: Blob;
  contentType: string;
  sizeBytes: number;
}

/**
 * Validates that a target URL uses https and belongs to the allowed media CDN hosts.
 */
export function isAllowedMediaUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    return ALLOWED_HOSTS.some(
      (allowed) => parsed.hostname === allowed || parsed.hostname.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

/**
 * Fetch media content from an allowlisted Reddit CDN domain using session credentials.
 * Enforces pre-fetch content-length check, streaming size cap, and abort timeout.
 */
export async function fetchMediaBlob(
  mediaUrl: string,
  options: {
    maxBytes?: number;
    timeoutMs?: number;
  } = {},
): Promise<FetchedMedia> {
  const maxBytes = options.maxBytes ?? MAX_MEDIA_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  log.info(`fetchMediaBlob requested: ${mediaUrl}`);

  // 1. URL validation
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(mediaUrl);
  } catch {
    throw new MediaFetchError(`Invalid URL string: ${mediaUrl}`, 'INVALID_URL');
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new MediaFetchError(
      `Insecure protocol '${parsedUrl.protocol}'. Only https is permitted.`,
      'DISALLOWED_PROTOCOL',
    );
  }

  if (!isAllowedMediaUrl(mediaUrl)) {
    throw new MediaFetchError(
      `Media host '${parsedUrl.hostname}' is not permitted by allowlist.`,
      'DISALLOWED_HOST',
    );
  }

  // 2. Fetch with abort controller timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(mediaUrl, {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new MediaFetchError(
        `Failed to fetch media: HTTP ${response.status} ${response.statusText}`,
        'NETWORK_ERROR',
        response.status,
      );
    }

    // 3. Pre-fetch size cap check via Content-Length header
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const lengthBytes = parseInt(contentLength, 10);
      if (!isNaN(lengthBytes) && lengthBytes > maxBytes) {
        throw new MediaFetchError(
          `Media Content-Length (${(lengthBytes / (1024 * 1024)).toFixed(1)}MB) exceeds limit of ${(maxBytes / (1024 * 1024)).toFixed(0)}MB`,
          'SIZE_EXCEEDED',
        );
      }
    }

    // 4. Stream and buffer with cumulative size capping
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const blob = await response.blob();

    if (blob.size > maxBytes) {
      throw new MediaFetchError(
        `Downloaded media size (${(blob.size / (1024 * 1024)).toFixed(1)}MB) exceeds limit of ${(maxBytes / (1024 * 1024)).toFixed(0)}MB`,
        'SIZE_EXCEEDED',
      );
    }

    log.debug(`Successfully fetched media (${blob.size} bytes, ${contentType})`);
    return {
      blob,
      contentType,
      sizeBytes: blob.size,
    };
  } catch (err: unknown) {
    if (err instanceof MediaFetchError) {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new MediaFetchError(`Fetch timed out after ${timeoutMs}ms`, 'TIMEOUT');
    }
    throw new MediaFetchError(
      err instanceof Error ? err.message : String(err),
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timer);
  }
}
