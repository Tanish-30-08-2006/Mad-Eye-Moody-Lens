/**
 * adapters/reddit/index.ts – Reddit SiteAdapter implementation.
 *
 * Implements the SiteAdapter interface for Reddit (www.reddit.com, sh.reddit.com).
 * Wires the observer, SPA navigation watcher, extractors and the markup-drift canary.
 */

import type { SiteAdapter, MediaRef, MountPoint, PostCallback } from '../types';
import { createLogger } from '../../core/logger';
import {
  POST_SELECTOR,
  ATTR_POST_TYPE,
  ATTR_POST_ID,
  FEED_PATH_PATTERN,
  MEDIA_CONTAINER_SELECTOR,
  MEDIA_POST_TYPES,
} from './selectors';
import { extractImage } from './extract-image';
import { extractGallery } from './extract-gallery';
import { extractVideo } from './extract-video';
import { createPostObserver, type PostObserver } from './observer';
import { watchNavigation } from './spa-navigation';
import { describePost } from './debug';

const log = createLogger('reddit-adapter');

/** How long a feed page may stay without any post before we assume the markup changed. */
const CANARY_DELAY_MS = 10_000;

let observer: PostObserver | null = null;
let navCleanup: (() => void) | null = null;
let canaryTimer: ReturnType<typeof setTimeout> | null = null;
let canaryWarned = false;

/** Warns once per page load if a feed page shows no <shreddit-post> (likely markup drift). */
function armCanary(): void {
  if (canaryWarned || canaryTimer !== null) return;
  if (!FEED_PATH_PATTERN.test(location.pathname)) return;
  canaryTimer = setTimeout(() => {
    canaryTimer = null;
    if (document.querySelector(POST_SELECTOR)) return;
    canaryWarned = true;
    log.warn(`No <${POST_SELECTOR}> found after ${CANARY_DELAY_MS / 1000}s on a feed page: Reddit markup may have changed.`);
  }, CANARY_DELAY_MS);
}

function disarmCanary(): void {
  if (canaryTimer !== null) clearTimeout(canaryTimer);
  canaryTimer = null;
}

export const redditAdapter: SiteAdapter = {
  siteName: 'Reddit',

  matchPatterns: ['*://www.reddit.com/*', '*://sh.reddit.com/*'],

  findPosts(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(POST_SELECTOR));
  },

  isMediaPost(post: HTMLElement): boolean {
    const type = post.getAttribute(ATTR_POST_TYPE);
    return !!type && (MEDIA_POST_TYPES as readonly string[]).includes(type);
  },

  extractMedia(post: HTMLElement): MediaRef | null {
    switch (post.getAttribute(ATTR_POST_TYPE)) {
      case 'image':
        return extractImage(post);
      case 'gallery':
        return extractGallery(post);
      case 'video':
      case 'gif':
        return extractVideo(post);
      default:
        // text, link, crosspost, removed and unknown types carry no scannable media.
        return null;
    }
  },

  getMountPoint(post: HTMLElement): MountPoint | null {
    const postId = post.getAttribute(ATTR_POST_ID);
    if (!postId) return null;
    let anchor: HTMLElement | null = null;
    try {
      anchor = post.querySelector<HTMLElement>(MEDIA_CONTAINER_SELECTOR);
    } catch {
      anchor = null;
    }
    return { postElement: post, anchorElement: anchor ?? post, postId };
  },

  describe(post: HTMLElement) {
    return describePost(post, this.extractMedia(post));
  },

  observe(onPost: PostCallback, onNavigate?: () => void): void {
    if (observer) return;
    log.info('Starting Reddit feed observation');

    const begin = () => {
      observer = createPostObserver({ onPost });
      observer.start();
      armCanary();
    };
    begin();

    navCleanup = watchNavigation(() => {
      // Navigation: stop, clear everything we added, then restart on the new page.
      observer?.stop();
      disarmCanary();
      onNavigate?.();
      begin();
    });
  },

  disconnect(): void {
    log.info('Stopping Reddit feed observation');
    navCleanup?.();
    navCleanup = null;
    observer?.stop();
    observer = null;
    disarmCanary();
  },
};
