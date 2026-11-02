/**
 * adapters/reddit/spa-navigation.ts – SPA navigation detection for Reddit.
 *
 * Reddit is an SPA (single-page app). Navigating between pages does not
 * trigger a full page load, so the content script must detect route changes
 * and re-scan for posts. This module listens for SPA navigation events
 * (popstate, pushState, replaceState) and triggers re-observation.
 *
 * TODO: Implement in Phase 4.
 */

import { createLogger } from '../../core/logger';

const log = createLogger('reddit-spa-nav');

/**
 * Start listening for SPA navigation events on Reddit.
 * Calls `onNavigate` each time the user navigates to a new page within Reddit.
 *
 * TODO: Implement in Phase 4.
 *
 * @param onNavigate Callback fired on each SPA navigation.
 * @returns Cleanup function to remove listeners.
 */
export function watchNavigation(
  _onNavigate: (url: string) => void,
): () => void {
  log.info('watchNavigation called (stub)');

  // TODO: Phase 4 – monkey-patch history.pushState / replaceState
  // TODO: Phase 4 – listen for popstate events
  // TODO: Phase 4 – detect feed/tab switches (hot, new, top, etc.)

  return () => {
    log.info('watchNavigation cleanup (stub)');
    // TODO: Remove event listeners and restore originals in Phase 4
  };
}
