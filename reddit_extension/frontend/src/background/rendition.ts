/**
 * background/rendition.ts – Picks which progressive MP4 rendition of a Reddit video to upload.
 *
 * Small renditions keep uploads fast and under the size cap; detectors do not need 1080p.
 */

import { videoFileKind } from '../core/media-url';

/** Largest height we prefer (360-480p keeps uploads small). */
export const PREFERRED_MAX_HEIGHT = 480;

export interface RenditionChoice {
  /** Progressive MP4 URLs, best first. Try them in order if one exceeds the size cap. */
  candidates: string[];
  /** True when only HLS/DASH manifests exist (no progressive MP4 to upload). */
  streamingOnly: boolean;
}

/** Reads the height from names like DASH_480.mp4 / CMAF_720.mp4; null if the name has no height. */
export function renditionHeight(url: string): number | null {
  try {
    const m = /_(\d{3,4})(?:p)?\.mp4$/i.exec(new URL(url).pathname);
    return m ? parseInt(m[1]!, 10) : null;
  } catch {
    return null;
  }
}

export function pickRenditions(urls: string[]): RenditionChoice {
  const mp4s = urls.filter((u) => videoFileKind(u) === 'mp4');
  const streaming = urls.some((u) => {
    const k = videoFileKind(u);
    return k === 'hls' || k === 'dash';
  });

  const withHeight = mp4s.map((url) => ({ url, h: renditionHeight(url) }));
  // Tier 1: known height within the preference, tallest first.
  const preferred = withHeight.filter((r) => r.h !== null && r.h <= PREFERRED_MAX_HEIGHT).sort((a, b) => b.h! - a.h!);
  // Tier 2: unknown height (cannot judge size, but better than blindly taking the biggest).
  const unknown = withHeight.filter((r) => r.h === null);
  // Tier 3: taller than preferred, smallest first.
  const larger = withHeight.filter((r) => r.h !== null && r.h > PREFERRED_MAX_HEIGHT).sort((a, b) => a.h! - b.h!);

  return {
    candidates: [...preferred, ...unknown, ...larger].map((r) => r.url),
    streamingOnly: mp4s.length === 0 && streaming,
  };
}
