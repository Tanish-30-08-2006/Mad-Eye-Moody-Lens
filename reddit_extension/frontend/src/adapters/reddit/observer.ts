/**
 * adapters/reddit/observer.ts – MutationObserver for new Reddit posts.
 *
 * Watches the feed container (<shreddit-feed>) for newly added posts.
 * Uses a debounced MutationObserver (~300ms) to batch mutations from
 * infinite scroll. Only processes visible posts via IntersectionObserver.
 *
 * TODO: Implement MutationObserver + IntersectionObserver in Phase 4.
 */

import { createLogger } from '../../core/logger';
import { FEED_SELECTOR, POST_SELECTOR, PROCESSED_MARKER } from './selectors';

const log = createLogger('reddit-observer');

/** Debounce interval for MutationObserver callbacks (ms). */
const DEBOUNCE_MS = 300;

/**
 * Start observing the Reddit feed for new posts.
 * Calls `onNewPosts` with an array of newly added, unprocessed post elements.
 *
 * TODO: Implement in Phase 4.
 *
 * @param onNewPosts Callback receiving newly detected post elements.
 * @returns Cleanup function to disconnect observers.
 */
export function observeFeed(
  _onNewPosts: (posts: HTMLElement[]) => void,
): () => void {
  log.info('observeFeed called (stub) – will watch', FEED_SELECTOR);
  log.debug('Debounce:', DEBOUNCE_MS, 'ms');
  log.debug('Post selector:', POST_SELECTOR);
  log.debug('Marker:', PROCESSED_MARKER);

  // TODO: Phase 4 – set up MutationObserver on shreddit-feed
  // TODO: Phase 4 – set up IntersectionObserver for visible posts
  // TODO: Phase 4 – debounce mutations and dedupe with WeakSet + marker attribute

  return () => {
    log.info('observeFeed cleanup (stub)');
    // TODO: Disconnect both observers in Phase 4
  };
}
