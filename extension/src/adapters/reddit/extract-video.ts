/**
 * adapters/reddit/extract-video.ts – Extract video media from a Reddit post.
 *
 * Handles video posts (post-type="video") and GIFs. Reddit video is split:
 * video-only renditions (DASH_* or CMAF_*) plus a separate audio file
 * (DASH_audio.mp4). Naming varies, so URLs must be read from the page or
 * manifest, never hardcoded.
 *
 * TODO: Implement in Phase 4 / Phase 6 after DOM-RECON confirms video structure.
 */

import { createLogger } from '../../core/logger';
import type { MediaRef } from '../types';
import { ATTR_PERMALINK, ATTR_POST_ID, ATTR_POST_TITLE } from './selectors';

const log = createLogger('extract-video');

/**
 * Extract a video MediaRef from a video or GIF Reddit post.
 * Returns null if the post is not a video post or extraction fails.
 *
 * TODO: Implement in Phase 4 / Phase 6.
 */
export function extractVideo(post: HTMLElement): MediaRef | null {
  log.debug('extractVideo called (stub) for post:', post.getAttribute(ATTR_POST_ID));

  const permalink = post.getAttribute(ATTR_PERMALINK);
  const postId = post.getAttribute(ATTR_POST_ID);
  const title = post.getAttribute(ATTR_POST_TITLE);

  if (!permalink || !postId) {
    log.warn('Missing required attributes for video extraction');
    return null;
  }

  // TODO: Phase 4 – Find shreddit-player or <video> element
  // TODO: Phase 4 – Extract video source URL (DASH manifest or direct MP4)
  // TODO: Phase 6 – Extract separate audio track URL
  // TODO: Phase 6 – Prefer mid-quality rendition (360-480p)
  // TODO: Phase 6 – Handle silent videos/GIFs (no audio track)

  return {
    kind: 'video',
    urls: [], // TODO: Phase 4 – Populate with video rendition URLs
    audioUrl: undefined, // TODO: Phase 6 – Populate with audio track URL
    permalink,
    postId,
    title: title ?? undefined,
  };
}
