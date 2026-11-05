/**
 * adapters/reddit/extract-common.ts – Shared, defensive helpers for the media extractors.
 *
 * Everything here is pure: it reads a post element and returns plain data, never throwing.
 */

import { isAllowedMediaUrl } from '../../core/media-url';
import {
  ATTR_PERMALINK,
  ATTR_POST_ID,
  ATTR_POST_TITLE,
  DECORATIVE_IMAGE_PATTERN,
  GALLERY_SELECTOR,
  IMAGE_SELECTOR,
  IMG_URL_ATTRS,
} from './selectors';

export interface PostBase {
  postId: string;
  permalink: string;
  title?: string;
}

/** Reads the verified identity attributes; null when the post cannot be identified. */
export function readPostBase(post: Element): PostBase | null {
  const postId = post.getAttribute(ATTR_POST_ID);
  const permalink = post.getAttribute(ATTR_PERMALINK);
  if (!postId || !permalink) return null;
  return { postId, permalink, title: post.getAttribute(ATTR_POST_TITLE) ?? undefined };
}

/** Resolves a possibly relative URL and keeps it only if https + allowlisted. */
export function validUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const href = new URL(raw.trim(), 'https://www.reddit.com').toString();
    return isAllowedMediaUrl(href) ? href : null;
  } catch {
    return null;
  }
}

/** Keeps first occurrences only, preserving order. */
export function dedupe(urls: string[]): string[] {
  return Array.from(new Set(urls));
}

/** Returns the widest candidate from an srcset string ("url 320w, url 640w"), or null. */
export function largestFromSrcset(srcset: string | null | undefined): string | null {
  if (!srcset) return null;
  let best: { url: string; weight: number } | null = null;
  for (const part of srcset.split(/,\s+(?=\S)/)) {
    const [url, descriptor] = part.trim().split(/\s+/);
    if (!url) continue;
    const weight = descriptor ? parseFloat(descriptor) || 0 : 0;
    if (!best || weight >= best.weight) best = { url, weight };
  }
  return best?.url ?? null;
}

/** Avatars, emoji and tiny icons are not post media. */
function isDecorativeImage(img: Element, url: string): boolean {
  if (DECORATIVE_IMAGE_PATTERN.test(url)) return true;
  const w = parseInt(img.getAttribute('width') ?? '', 10);
  const h = parseInt(img.getAttribute('height') ?? '', 10);
  return (!isNaN(w) && w <= 64) || (!isNaN(h) && h <= 64);
}

/** Every valid, non-decorative image URL under `root`, best candidate per <img>. */
export function collectImageUrls(root: ParentNode): string[] {
  const urls: string[] = [];
  try {
    for (const img of Array.from(root.querySelectorAll(IMAGE_SELECTOR))) {
      const candidates = [
        largestFromSrcset(img.getAttribute('srcset')),
        ...IMG_URL_ATTRS.map((attr) => img.getAttribute(attr)),
      ];
      for (const raw of candidates) {
        const url = validUrl(raw);
        if (url && !isDecorativeImage(img, url)) {
          urls.push(url);
          break;
        }
      }
    }
  } catch {
    // Unexpected DOM shape: return what we have.
  }
  return dedupe(urls);
}

/** Root that holds gallery slides: the carousel if present, otherwise the whole post. */
export function galleryRoot(post: Element): ParentNode {
  try {
    return post.querySelector(GALLERY_SELECTOR) ?? post;
  } catch {
    return post;
  }
}

/** Parses JSON without throwing. */
export function safeJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Walks any JSON value and returns every string leaf (depth-limited). */
export function jsonStrings(value: unknown, depth = 0): string[] {
  if (depth > 8 || value == null) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((v) => jsonStrings(v, depth + 1));
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((v) => jsonStrings(v, depth + 1));
  }
  return [];
}
