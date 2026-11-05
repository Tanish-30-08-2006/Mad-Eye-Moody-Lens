/**
 * adapters/reddit/extract-image.ts – Extract image media from a Reddit post.
 *
 * Handles single-image posts (post-type="image"). Extracts the full-resolution
 * image URL from the post element.
 *
 * TODO: Implement in Phase 4 after DOM-RECON confirms image element structure.
 */

import { createLogger } from '../../core/logger';
import type { MediaRef } from '../types';
import { ATTR_CONTENT_HREF, ATTR_PERMALINK, ATTR_POST_ID, ATTR_POST_TITLE } from './selectors';

const log = createLogger('extract-image');

/**
 * Extract an image MediaRef from a single-image Reddit post.
 * Returns null if the post is not an image post or extraction fails.
 *
 * TODO: Implement in Phase 4.
 */
export function extractImage(post: HTMLElement): MediaRef | null {
  log.debug('extractImage called (stub) for post:', post.getAttribute(ATTR_POST_ID));

  const permalink = post.getAttribute(ATTR_PERMALINK);
  const postId = post.getAttribute(ATTR_POST_ID);
  const contentHref = post.getAttribute(ATTR_CONTENT_HREF);
  const title = post.getAttribute(ATTR_POST_TITLE);

  if (!permalink || !postId || !contentHref) {
    log.warn('Missing required attributes for image extraction');
    return null;
  }

  // TODO: Phase 4 – Find the actual <img> element and extract src/srcset
  // TODO: Phase 4 – Prefer full-resolution URL over thumbnail
  // TODO: Phase 4 – Handle preview.redd.it vs i.redd.it URLs

  return {
    kind: 'image',
    urls: [contentHref],
    permalink,
    postId,
    title: title ?? undefined,
  };
}
