/**
 * adapters/reddit/extract-video.ts – Extract video (and separate audio) from a Reddit post.
 *
 * Reddit splits video and audio, and rendition names vary (DASH_* vs CMAF_*), so every
 * URL is read from the page, never constructed. HLS/DASH manifests are kept in `urls`
 * so the service worker can tell "unsupported format" apart from "nothing found".
 */

import type { MediaRef } from '../types';
import { isAudioTrackUrl, videoFileKind } from '../../core/media-url';
import {
  ATTR_CONTENT_HREF,
  ATTR_PACKAGED_MEDIA,
  PLAYER_SELECTOR,
  PLAYER_URL_ATTRS,
  VIDEO_SELECTOR,
} from './selectors';
import { dedupe, jsonStrings, readPostBase, safeJson, validUrl } from './extract-common';

export interface VideoCandidates {
  /** Valid allowlisted URLs with a recognised video file extension (audio tracks excluded). */
  video: string[];
  /** Valid allowlisted URLs that look like an audio track. */
  audio: string[];
}

/** Collects every plausible video/audio URL in the post (also used by the debug helper). */
export function videoCandidates(post: HTMLElement): VideoCandidates {
  const raw: (string | null)[] = [post.getAttribute(ATTR_CONTENT_HREF)];

  try {
    for (const player of Array.from(post.querySelectorAll(PLAYER_SELECTOR))) {
      for (const attr of PLAYER_URL_ATTRS) raw.push(player.getAttribute(attr));
      raw.push(...jsonStrings(safeJson(player.getAttribute(ATTR_PACKAGED_MEDIA))));
    }
    for (const video of Array.from(post.querySelectorAll(VIDEO_SELECTOR))) {
      raw.push(video.getAttribute('src'));
      for (const source of Array.from(video.querySelectorAll('source'))) {
        raw.push(source.getAttribute('src'));
      }
    }
  } catch {
    // Unexpected DOM shape: keep what was gathered.
  }

  const video: string[] = [];
  const audio: string[] = [];
  for (const candidate of raw) {
    const url = validUrl(candidate);
    if (!url || !videoFileKind(url)) continue;
    (isAudioTrackUrl(url) ? audio : video).push(url);
  }
  return { video: dedupe(video), audio: dedupe(audio) };
}

export function extractVideo(post: HTMLElement): MediaRef | null {
  try {
    const base = readPostBase(post);
    if (!base) return null;
    const { video, audio } = videoCandidates(post);
    if (video.length === 0) return null;
    // A silent video simply has no audio candidate; that is not an error.
    return { kind: 'video', urls: video, audioUrl: audio[0], ...base };
  } catch {
    return null;
  }
}
