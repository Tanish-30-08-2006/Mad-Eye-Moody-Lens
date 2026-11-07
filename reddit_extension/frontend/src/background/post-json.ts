/**
 * background/post-json.ts – Fallback media resolver: reads `<permalink>.json` in the user's session.
 *
 * Used only when the page's DOM gave us nothing for a media post. Parsing is defensive and every
 * URL is checked against the media allowlist; anything else is dropped.
 */

import { createLogger } from '../core/logger';
import { isAllowedMediaUrl } from '../core/media-url';

const log = createLogger('post-json');

export const MAX_GALLERY_IMAGES = 10;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_CROSSPOST_DEPTH = 2;
const REDDIT_HOSTS = new Set(['www.reddit.com', 'reddit.com', 'old.reddit.com', 'sh.reddit.com']);

export interface ResolvedMedia {
  kind: 'image' | 'gallery' | 'video' | 'gif';
  mediaType: 'image' | 'video';
  urls: string[];
  /** DASH manifest listed in the JSON; the audio file name is read from it, never guessed. */
  mpdUrl?: string;
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** `raw_json=1` normally avoids HTML escaping, but decode anyway in case it is ignored. */
function cleanUrl(raw: unknown): string | null {
  const text = str(raw);
  if (!text) return null;
  try {
    const url = new URL(text.replace(/&amp;/g, '&'));
    return isAllowedMediaUrl(url.toString()) ? url.toString() : null;
  } catch {
    return null;
  }
}

// UNVERIFIED: confirm in DevTools – the shape of Reddit's post JSON (field names below come from memory of the public format).
function fromGallery(post: Json): ResolvedMedia | null {
  const items = isObject(post.gallery_data) && Array.isArray(post.gallery_data.items) ? post.gallery_data.items : [];
  const metadata = isObject(post.media_metadata) ? post.media_metadata : {};
  const urls: string[] = [];
  for (const item of items) {
    const entry = isObject(item) && typeof item.media_id === 'string' ? metadata[item.media_id] : null;
    const source = isObject(entry) && isObject(entry.s) ? entry.s : null;
    const url = source ? (cleanUrl(source.u) ?? cleanUrl(source.gif)) : null;
    if (url) urls.push(url);
    if (urls.length >= MAX_GALLERY_IMAGES) break;
  }
  return urls.length > 0 ? { kind: 'gallery', mediaType: 'image', urls } : null;
}

// UNVERIFIED: confirm in DevTools
function fromVideo(post: Json): ResolvedMedia | null {
  const media = isObject(post.secure_media) ? post.secure_media : isObject(post.media) ? post.media : null;
  const video = media && isObject(media.reddit_video) ? media.reddit_video : null;
  const previewVideo = isObject(post.preview) && isObject(post.preview.reddit_video_preview) ? post.preview.reddit_video_preview : null;
  const source = video ?? previewVideo;
  const url = source ? cleanUrl(source.fallback_url) : null;
  if (!source || !url) return null;
  const mpdUrl = cleanUrl(source.dash_url) ?? undefined;
  return { kind: source.is_gif === true ? 'gif' : 'video', mediaType: 'video', urls: [url], mpdUrl };
}

// UNVERIFIED: confirm in DevTools
function fromImage(post: Json): ResolvedMedia | null {
  const previews = isObject(post.preview) && Array.isArray(post.preview.images) ? post.preview.images : [];
  const first = previews[0];
  const url = cleanUrl(post.url_overridden_by_dest) ?? cleanUrl(post.url) ?? (isObject(first) && isObject(first.source) ? cleanUrl(first.source.url) : null);
  return url ? { kind: 'image', mediaType: 'image', urls: [url] } : null;
}

function fromPost(post: Json, depth: number): ResolvedMedia | null {
  const own = fromGallery(post) ?? fromVideo(post) ?? fromImage(post);
  if (own) return own;
  // A crosspost carries the original post; scan that.
  const parent = Array.isArray(post.crosspost_parent_list) ? post.crosspost_parent_list[0] : null;
  return depth < MAX_CROSSPOST_DEPTH && isObject(parent) ? fromPost(parent, depth + 1) : null;
}

/** Extracts media from a parsed `.json` response; null when nothing allowlisted is found. */
export function parsePostJson(json: unknown): ResolvedMedia | null {
  try {
    const listing = Array.isArray(json) ? json[0] : json;
    const children = isObject(listing) && isObject(listing.data) && Array.isArray(listing.data.children) ? listing.data.children : [];
    const post = isObject(children[0]) && isObject(children[0].data) ? children[0].data : null;
    return post ? fromPost(post, 0) : null;
  } catch {
    return null;
  }
}

/** The `.json` URL for a post permalink, or null when it is not a Reddit https link. */
export function postJsonUrl(permalink: string): string | null {
  try {
    const url = new URL(permalink);
    if (url.protocol !== 'https:' || !REDDIT_HOSTS.has(url.hostname)) return null;
    return `${url.origin}${url.pathname.replace(/\/?$/, '/')}.json?raw_json=1`;
  } catch {
    return null;
  }
}

export async function resolveFromPostJson(permalink: string): Promise<ResolvedMedia | null> {
  const url = postJsonUrl(permalink);
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { credentials: 'include', signal: controller.signal });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > MAX_JSON_BYTES) return null;
    return parsePostJson(JSON.parse(text));
  } catch (err) {
    log.debug('Post JSON fallback failed:', err instanceof Error ? err.name : '');
    return null;
  } finally {
    clearTimeout(timer);
  }
}
