/**
 * core/media-url.ts – Single source of truth for which media URLs the extension may touch.
 *
 * Shared by the content script (extractors, message validation) and the service worker (fetcher).
 */

/** Allowed hosts for media fetching. */
export const ALLOWED_HOSTS = [
  'i.redd.it',
  'v.redd.it',
  'preview.redd.it',
  'external-preview.redd.it',
];

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

export type VideoFileKind = 'mp4' | 'hls' | 'dash';

/** Classifies a video URL by file extension; bare v.redd.it/<id> pages are not media files. */
export function videoFileKind(urlStr: string): VideoFileKind | null {
  try {
    const path = new URL(urlStr).pathname.toLowerCase();
    if (path.endsWith('.mp4')) return 'mp4';
    if (path.endsWith('.m3u8')) return 'hls';
    if (path.endsWith('.mpd')) return 'dash';
  } catch {
    // fall through
  }
  return null;
}

/** True when the URL looks like a separate audio track (e.g. DASH_audio.mp4). */
export function isAudioTrackUrl(urlStr: string): boolean {
  try {
    return /(^|[_/.-])audio/i.test(new URL(urlStr).pathname);
  } catch {
    return false;
  }
}
