/**
 * adapters/reddit/extract-comment.ts – Images inside a comment.
 *
 * All markup here is UNVERIFIED (see selectors.ts). Nested replies live inside their parent
 * comment's DOM, so images are kept only when this comment is their nearest comment.
 */

import type { MediaRef } from '../types';
import { ATTR_COMMENT_ID, ATTR_COMMENT_PERMALINK, COMMENT_IMAGE_SELECTOR, COMMENT_SELECTOR } from './selectors';
import { collectImageUrls } from './extract-common';
import { MAX_GALLERY_IMAGES } from './extract-gallery';

/** The element the lens is anchored to: the first own image's wrapper. */
export function commentImageAnchor(comment: HTMLElement): HTMLElement | null {
  const image = ownImages(comment)[0];
  return image ? (image.closest<HTMLElement>('figure, a') ?? image.parentElement) : null;
}

function ownImages(comment: HTMLElement): HTMLElement[] {
  try {
    return Array.from(comment.querySelectorAll<HTMLElement>(COMMENT_IMAGE_SELECTOR)).filter(
      (img) => img.closest(COMMENT_SELECTOR) === comment,
    );
  } catch {
    return [];
  }
}

export function hasCommentImages(comment: HTMLElement): boolean {
  return extractComment(comment) !== null;
}

export function extractComment(comment: HTMLElement): MediaRef | null {
  try {
    const postId = comment.getAttribute(ATTR_COMMENT_ID);
    const permalink = comment.getAttribute(ATTR_COMMENT_PERMALINK);
    if (!postId || !permalink) return null;
    // Reuse the post image logic on a detached holder that only contains this comment's own images.
    const holder = document.createElement('div');
    for (const img of ownImages(comment)) holder.appendChild(img.cloneNode(false));
    const urls = collectImageUrls(holder).slice(0, MAX_GALLERY_IMAGES);
    if (urls.length === 0) return null;
    return { kind: urls.length > 1 ? 'gallery' : 'image', urls, postId, permalink };
  } catch {
    return null;
  }
}
