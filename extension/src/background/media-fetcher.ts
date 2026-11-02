/**
 * background/media-fetcher.ts – Fetches media bytes using the browser's session.
 *
 * Runs in the service worker context to leverage host permissions and browser cookies.
 * Strictly enforces an allowlist of CDN domains and file size limits.
 *
 * TODO: Implement byte fetching and streaming upload in Phase 3.
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

/** Maximum allowed media download size (50MB). */
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

export interface FetchedMedia {
  blob: Blob;
  contentType: string;
  sizeBytes: number;
}

/**
 * Validates that a target URL belongs to the allowed media CDN hosts.
 */
export function isAllowedMediaHost(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return ALLOWED_HOSTS.some(
      (allowed) => parsed.hostname === allowed || parsed.hostname.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

/**
 * Fetch media content from Reddit's CDN using browser session credentials.
 * TODO: Implement stream reader and size capping in Phase 3.
 */
export async function fetchMediaBlob(mediaUrl: string): Promise<FetchedMedia> {
  log.info(`fetchMediaBlob requested for: ${mediaUrl} (stub)`);

  if (!isAllowedMediaHost(mediaUrl)) {
    throw new Error(`Media host not permitted by allowlist: ${mediaUrl}`);
  }

  // TODO: Phase 3 – Perform fetch() with credentials and size cap
  throw new Error('fetchMediaBlob not implemented – Phase 3');
}
