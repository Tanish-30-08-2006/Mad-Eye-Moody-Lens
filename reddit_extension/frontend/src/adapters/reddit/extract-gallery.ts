/**
 * adapters/reddit/extract-gallery.ts – Extract all images of a gallery post.
 *
 * Reads slide images from the carousel if present, else from the whole post.
 */

import type { MediaRef } from '../types';
import { collectImageUrls, galleryRoot, readPostBase } from './extract-common';

export function galleryCandidates(post: HTMLElement): string[] {
  return collectImageUrls(galleryRoot(post));
}

export function extractGallery(post: HTMLElement): MediaRef | null {
  try {
    const base = readPostBase(post);
    if (!base) return null;
    const urls = galleryCandidates(post);
    if (urls.length === 0) return null;
    return { kind: 'gallery', urls, ...base };
  } catch {
    return null;
  }
}
