/**
 * adapters/reddit/index.ts – Reddit SiteAdapter implementation.
 *
 * Implements the SiteAdapter interface for Reddit (www.reddit.com, sh.reddit.com).
 * Delegates post-finding, media extraction, and observation to sub-modules.
 *
 * TODO: Wire up all sub-modules in Phase 4.
 */

import type { SiteAdapter, MediaRef, MountPoint } from '../types';
import { createLogger } from '../../core/logger';
import {
  POST_SELECTOR,
  ATTR_POST_TYPE,
  ATTR_POST_ID,
  PROCESSED_MARKER,
} from './selectors';
import { extractImage } from './extract-image';
import { extractGallery } from './extract-gallery';
import { extractVideo } from './extract-video';
import { observeFeed } from './observer';
import { watchNavigation } from './spa-navigation';

const log = createLogger('reddit-adapter');

/** Cleanup functions for active observers. */
let feedCleanup: (() => void) | null = null;
let navCleanup: (() => void) | null = null;

export const redditAdapter: SiteAdapter = {
  siteName: 'Reddit',

  matchPatterns: [
    '*://*.reddit.com/*',
  ],

  findPosts(): HTMLElement[] {
    const posts = Array.from(
      document.querySelectorAll<HTMLElement>(POST_SELECTOR),
    );
    log.debug(`Found ${posts.length} posts in DOM`);
    return posts.filter(
      (post) => !post.hasAttribute(PROCESSED_MARKER),
    );
  },

  extractMedia(post: HTMLElement): MediaRef | null {
    const postType = post.getAttribute(ATTR_POST_TYPE);
    const postId = post.getAttribute(ATTR_POST_ID);
    log.debug(`Extracting media from post ${postId}, type: ${postType}`);

    switch (postType) {
      case 'image':
        return extractImage(post);
      case 'gallery':
        return extractGallery(post);
      case 'video':
        return extractVideo(post);
      // TODO: Phase 4 – Handle 'link', 'crosspost', etc.
      default:
        log.debug(`Skipping unsupported post type: ${postType}`);
        return null;
    }
  },

  getMountPoint(post: HTMLElement): MountPoint | null {
    const postId = post.getAttribute(ATTR_POST_ID);
    if (!postId) return null;

    // TODO: Phase 5 – Find the action bar area for button placement
    // For now, use the post element itself as the anchor
    return {
      postElement: post,
      anchorElement: post,
      postId,
    };
  },

  observe(onNewPosts: (posts: HTMLElement[]) => void): void {
    log.info('Starting Reddit feed observation');
    feedCleanup = observeFeed(onNewPosts);
    navCleanup = watchNavigation((_url) => {
      // TODO: Phase 4 – Re-scan for posts after SPA navigation
      log.info('SPA navigation detected, should re-scan');
    });
  },

  disconnect(): void {
    log.info('Stopping Reddit feed observation');
    feedCleanup?.();
    navCleanup?.();
    feedCleanup = null;
    navCleanup = null;
  },
};
