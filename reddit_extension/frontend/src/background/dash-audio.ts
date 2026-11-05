/**
 * background/dash-audio.ts – Finds the audio file of a v.redd.it video from its DASH manifest.
 *
 * Only names listed in DASHPlaylist.mpd are ever fetched; nothing is guessed. The service worker
 * has no DOMParser, so the manifest is read with narrow, tolerant patterns.
 */

import { isAllowedMediaUrl } from '../core/media-url';

export type AudioResolution = { status: 'found'; url: string } | { status: 'none' } | { status: 'failed' };

const XML_ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m);
}

/** The manifest next to a v.redd.it rendition (".../<id>/DASH_480.mp4" -> ".../<id>/DASHPlaylist.mpd"), or null. */
export function mpdUrlFor(videoUrl: string): string | null {
  try {
    const url = new URL(videoUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'v.redd.it') return null;
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id ? `https://v.redd.it/${id}/DASHPlaylist.mpd` : null;
  } catch {
    return null;
  }
}

interface AudioCandidate {
  baseUrl: string;
  bandwidth: number;
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return match ? decodeEntities(match[1]!) : null;
}

function baseUrlOf(block: string): string | null {
  const match = /<BaseURL>\s*([^<]+?)\s*<\/BaseURL>/.exec(block);
  return match ? decodeEntities(match[1]!) : null;
}

/** All audio representations listed in the manifest (BaseURL + bandwidth), in document order. */
export function audioCandidates(xml: string): AudioCandidate[] {
  const out: AudioCandidate[] = [];
  for (const set of xml.matchAll(/<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/g)) {
    const setAttrs = set[1]!;
    const setIsAudio = attr(setAttrs, 'contentType') === 'audio' || (attr(setAttrs, 'mimeType') ?? '').startsWith('audio/');
    const setBase = baseUrlOf(set[2]!.replace(/<Representation\b[\s\S]*?<\/Representation>/g, ''));
    for (const rep of set[2]!.matchAll(/<Representation\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Representation>)/g)) {
      const repAttrs = rep[1]!;
      const isAudio = setIsAudio || (attr(repAttrs, 'mimeType') ?? '').startsWith('audio/');
      const baseUrl = baseUrlOf(rep[2] ?? '') ?? setBase;
      if (isAudio && baseUrl) out.push({ baseUrl, bandwidth: Number(attr(repAttrs, 'bandwidth')) || 0 });
    }
  }
  return out;
}

/** Highest-bandwidth audio file listed in the manifest, resolved against the manifest URL; null if none or not allowlisted. */
export function parseAudioFromMpd(xml: string, mpdUrl: string): string | null {
  const best = audioCandidates(xml).sort((a, b) => b.bandwidth - a.bandwidth)[0];
  if (!best) return null;
  try {
    const resolved = new URL(best.baseUrl, mpdUrl).toString();
    return isAllowedMediaUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

/**
 * Looks up the audio file for a video URL. "none" means the manifest was read and lists no audio
 * (a silent video); "failed" means we could not find out, so the UI should say audio was not scanned.
 */
export async function resolveAudio(
  videoUrl: string,
  fetchText: (url: string) => Promise<string>,
  mpdOverride?: string,
): Promise<AudioResolution> {
  const mpdUrl = mpdOverride && isAllowedMediaUrl(mpdOverride) ? mpdOverride : mpdUrlFor(videoUrl);
  if (!mpdUrl) return { status: 'none' }; // Not a v.redd.it video: nothing to look up.
  try {
    const xml = await fetchText(mpdUrl);
    if (!/<MPD\b/.test(xml)) return { status: 'failed' };
    const url = parseAudioFromMpd(xml, mpdUrl);
    return url ? { status: 'found', url } : audioCandidates(xml).length > 0 ? { status: 'failed' } : { status: 'none' };
  } catch {
    return { status: 'failed' };
  }
}
