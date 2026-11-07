/**
 * core/errors.ts – Maps every typed failure to a stable code and a friendly message.
 *
 * Messages never include post titles, usernames or media URLs.
 */

import { ApiClientError } from '../core/api-client';
import { MediaFetchError } from './media-fetcher';
import { PollerError } from './job-poller';

export class ScanError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ScanError';
  }
}

export interface FriendlyError {
  code: string;
  message: string;
}

export const MESSAGES = {
  CONSENT_REQUIRED: 'Moody Lens needs your permission before it sends media to your backend.',
  UNSUPPORTED_VIDEO: 'Video format not supported yet.',
  NETWORK_ERROR: "Can't reach the Moody Lens backend. Check that it is running and the URL in Options is right.",
  FILE_TOO_LARGE: 'This media is too large to scan.',
  UNSUPPORTED_MEDIA_TYPE: "This media type isn't supported.",
  SERVICE_UNAVAILABLE: 'The backend is not ready (no workers or ffmpeg missing). Try again later.',
  TIMEOUT: 'The scan took too long. Please try again.',
  RATE_LIMITED: 'Too many automatic scans. Slow down or click the lens.',
  AUTO_SCAN_DISABLED: 'Automatic scanning is off.',
  REDDIT_BLOCKED: 'Reddit blocked the server download.',
  MEDIA_FETCH_FAILED: "Couldn't download this media from Reddit.",
  NO_MEDIA: "Couldn't find scannable media in this post.",
  JOB_FAILED: 'The backend could not analyse this media.',
  SCAN_FAILED: 'Something went wrong while scanning.',
} as const;

function friendly(code: keyof typeof MESSAGES): FriendlyError {
  return { code, message: MESSAGES[code] };
}

/** Converts any thrown value into a code + user-facing message. */
export function toFriendlyError(err: unknown): FriendlyError {
  if (err instanceof ScanError) {
    const known = MESSAGES[err.code as keyof typeof MESSAGES];
    return { code: err.code, message: known ?? err.message };
  }
  if (err instanceof ApiClientError) {
    if (err.code === 'NETWORK_ERROR') return friendly('NETWORK_ERROR');
    if (err.status === 413) return friendly('FILE_TOO_LARGE');
    if (err.status === 415) return friendly('UNSUPPORTED_MEDIA_TYPE');
    if (err.status === 503) return friendly('SERVICE_UNAVAILABLE');
    if (err.backendCode === 'REDDIT_BLOCKED') return friendly('REDDIT_BLOCKED');
    if (err.status === 429) return friendly('RATE_LIMITED');
    return friendly('SCAN_FAILED');
  }
  if (err instanceof PollerError) {
    return err.code === 'TIMEOUT' ? friendly('TIMEOUT') : friendly('JOB_FAILED');
  }
  if (err instanceof MediaFetchError) {
    if (err.code === 'SIZE_EXCEEDED') return friendly('FILE_TOO_LARGE');
    if (err.code === 'TIMEOUT') return friendly('TIMEOUT');
    return friendly('MEDIA_FETCH_FAILED');
  }
  return friendly('SCAN_FAILED');
}
