/**
 * adapters/reddit/debug.ts – Selector-debugging helper, used only when Debug is enabled.
 *
 * Dumps what the extractors can see in a post so selectors can be fixed from DevTools.
 */

import type { MediaRef } from '../types';
import { collectImageUrls } from './extract-common';
import { imageCandidates } from './extract-image';
import { galleryCandidates } from './extract-gallery';
import { videoCandidates } from './extract-video';

export interface PostDebugInfo {
  attributeNames: string[];
  candidates: {
    image: string[];
    gallery: string[];
    anyImg: string[];
    video: string[];
    audio: string[];
  };
  result: MediaRef | null;
}

export function describePost(post: HTMLElement, result: MediaRef | null): PostDebugInfo {
  const video = videoCandidates(post);
  return {
    attributeNames: post.getAttributeNames(),
    candidates: {
      image: imageCandidates(post),
      gallery: galleryCandidates(post),
      anyImg: collectImageUrls(post),
      video: video.video,
      audio: video.audio,
    },
    result,
  };
}
