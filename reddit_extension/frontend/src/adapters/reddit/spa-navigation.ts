/**
 * adapters/reddit/spa-navigation.ts – Detects client-side route changes on Reddit.
 *
 * Uses the Navigation API (`navigatesuccess`) when present; a debounced location.href
 * comparison covers browsers without it. History is never patched.
 */

import { createLogger } from '../../core/logger';

const log = createLogger('reddit-spa-nav');

const DEBOUNCE_MS = 150;
/** Fallback poll for browsers without the Navigation API. */
const POLL_MS = 1000;

interface NavigationLike extends EventTarget {
  // Only used for presence detection.
  currentEntry?: unknown;
}

export interface NavigationWatchOptions {
  /** Injected for tests. */
  getHref?: () => string;
  navigation?: NavigationLike | null;
}

/**
 * Calls `onNavigate(newUrl)` whenever the page URL changes. Returns a cleanup function.
 */
export function watchNavigation(
  onNavigate: (url: string) => void,
  options: NavigationWatchOptions = {},
): () => void {
  const getHref = options.getHref ?? (() => location.href);
  const nav =
    options.navigation !== undefined
      ? options.navigation
      : ((window as unknown as { navigation?: NavigationLike }).navigation ?? null);

  let lastHref = getHref();
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;

  // Compare after a short delay so bursts of events collapse into one notification.
  const check = () => {
    if (debounce !== null) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      const href = getHref();
      if (href === lastHref) return;
      lastHref = href;
      log.debug('Navigation detected');
      onNavigate(href);
    }, DEBOUNCE_MS);
  };

  nav?.addEventListener('navigatesuccess', check);
  window.addEventListener('popstate', check);
  if (!nav) poll = setInterval(check, POLL_MS);

  return () => {
    nav?.removeEventListener('navigatesuccess', check);
    window.removeEventListener('popstate', check);
    if (poll !== null) clearInterval(poll);
    if (debounce !== null) clearTimeout(debounce);
  };
}
