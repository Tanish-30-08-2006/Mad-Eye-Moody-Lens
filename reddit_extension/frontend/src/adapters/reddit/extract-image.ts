/**
 * adapters/reddit/extract-image.ts – Extract a single image from a Reddit post.
 *
 * Strategy: content-href first, then <img> elements (srcset/lazy attributes).
 * Returns null for anything that is not a validated, allowlisted image.
 */

import type { MediaRef } from '../types';
import { ATTR_CONTENT_HREF } from './selectors';
import { collectImageUrls, dedupe, readPostBase, validUrl } from './extract-common';

/** Candidate image URLs in priority order (also used by the debug helper). */
export function imageCandidates(post: HTMLElement): string[] {
  const fromHref = validUrl(post.getAttribute(ATTR_CONTENT_HREF));
  return dedupe([...(fromHref ? [fromHref] : []), ...collectImageUrls(post)]);
}

export function extractImage(post: HTMLElement): MediaRef | null {
  try {
    const base = readPostBase(post);
    if (!base) return null;
    const urls = imageCandidates(post);
    if (urls.length === 0) return null;
    return { kind: 'image', urls, ...base };
  } catch {
    return null;
  }
}
