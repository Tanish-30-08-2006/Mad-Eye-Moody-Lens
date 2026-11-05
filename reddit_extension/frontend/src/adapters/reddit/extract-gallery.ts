/**
 * adapters/reddit/extract-gallery.ts – Extract gallery media from a Reddit post.
 *
 * Handles multi-image gallery posts (post-type="gallery"). Extracts all image
 * URLs from the carousel/gallery component.
 *
 * TODO: Implement in Phase 4 after DOM-RECON confirms gallery element structure.
 */

import { createLogger } from '../../core/logger';
import type { MediaRef } from '../types';
import { ATTR_PERMALINK, ATTR_POST_ID, ATTR_POST_TITLE } from './selectors';

const log = createLogger('extract-gallery');

/**
 * Extract a gallery MediaRef from a multi-image Reddit post.
 * Returns null if the post is not a gallery post or extraction fails.
 *
 * TODO: Implement in Phase 4.
 */
export function extractGallery(post: HTMLElement): MediaRef | null {
  log.debug('extractGallery called (stub) for post:', post.getAttribute(ATTR_POST_ID));

  const permalink = post.getAttribute(ATTR_PERMALINK);
  const postId = post.getAttribute(ATTR_POST_ID);
  const title = post.getAttribute(ATTR_POST_TITLE);

  if (!permalink || !postId) {
    log.warn('Missing required attributes for gallery extraction');
    return null;
  }

  // TODO: Phase 4 – Find gallery carousel / slide elements
  // TODO: Phase 4 – Extract each image URL from slides
  // TODO: Phase 4 – Handle lazy-loaded gallery images

  return {
    kind: 'gallery',
    urls: [], // TODO: Phase 4 – Populate with actual gallery image URLs
    permalink,
    postId,
    title: title ?? undefined,
  };
}
