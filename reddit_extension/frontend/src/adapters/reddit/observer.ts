/**
 * adapters/reddit/observer.ts – Finds Reddit posts (and comments) as they are added and become visible.
 *
 * MutationObserver (added nodes only, debounced) feeds an IntersectionObserver so each
 * post is handed to `onPost` once, only when on screen. start()/stop() are idempotent and
 * stop() undoes everything this module added (markers, observers, per-post disposers).
 */

import { createLogger } from '../../core/logger';
import { OBSERVED_SELECTOR, PROCESSED_MARKER } from './selectors';

const log = createLogger('reddit-observer');

/** Debounce interval for MutationObserver callbacks (ms). */
export const DEBOUNCE_MS = 300;

/** Called once per visible post; may return a disposer run when the post goes away or on stop(). */
export type PostHandler = (post: HTMLElement) => void | (() => void);

export interface PostObserverOptions {
  onPost: PostHandler;
  root?: Document;
  debounceMs?: number;
}

export interface PostObserver {
  start(): void;
  stop(): void;
  /** Number of posts handed to onPost since start(). */
  processedCount(): number;
}

/** Collects posts that are the node itself or live inside it. */
function postsIn(node: Node, out: Set<HTMLElement>): void {
  if (node.nodeType !== 1) return;
  const el = node as HTMLElement;
  if (el.matches(OBSERVED_SELECTOR)) out.add(el);
  el.querySelectorAll<HTMLElement>(OBSERVED_SELECTOR).forEach((p) => out.add(p));
}

export function createPostObserver(options: PostObserverOptions): PostObserver {
  const root = options.root ?? document;
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS;

  let running = false;
  let mutations: MutationObserver | null = null;
  let intersections: IntersectionObserver | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = new Set<HTMLElement>();
  // WeakSets: tracked = being watched for visibility, handled = already passed to onPost.
  let tracked = new WeakSet<HTMLElement>();
  let handled = new WeakSet<HTMLElement>();
  const disposers = new Map<HTMLElement, () => void>();
  let processed = 0;

  // Start watching a post for visibility unless we already know it.
  const track = (post: HTMLElement) => {
    if (tracked.has(post) || handled.has(post)) return;
    tracked.add(post);
    intersections?.observe(post);
  };

  const handle = (post: HTMLElement) => {
    if (handled.has(post)) return;
    handled.add(post);
    post.setAttribute(PROCESSED_MARKER, '1');
    processed++;
    try {
      const dispose = options.onPost(post);
      if (dispose) disposers.set(post, dispose);
    } catch (err) {
      log.warn('onPost handler threw:', err);
    }
  };

  // Dispose UI for posts Reddit removed from the DOM (virtualised feeds recycle nodes).
  const pruneDisconnected = () => {
    for (const [post, dispose] of disposers) {
      if (post.isConnected) continue;
      disposers.delete(post);
      // Forget the node so it is processed afresh if Reddit re-inserts it.
      tracked.delete(post);
      handled.delete(post);
      post.removeAttribute(PROCESSED_MARKER);
      try {
        dispose();
      } catch (err) {
        log.warn('Disposer threw:', err);
      }
    }
  };

  const flush = () => {
    timer = null;
    const batch = pending;
    pending = new Set();
    batch.forEach((post) => {
      if (post.isConnected) track(post);
    });
    pruneDisconnected();
  };

  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };

  return {
    start() {
      if (running) return;
      running = true;
      processed = 0;

      intersections = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const post = entry.target as HTMLElement;
            intersections?.unobserve(post);
            handle(post);
          }
        },
        { rootMargin: '150px' },
      );

      mutations = new MutationObserver((records) => {
        // Only added nodes matter; removals are cleaned up lazily in flush().
        for (const record of records) {
          record.addedNodes.forEach((node) => postsIn(node, pending));
        }
        if (pending.size > 0) schedule();
      });
      mutations.observe(root.documentElement ?? root, { childList: true, subtree: true });

      // Initial scan runs immediately so already-rendered posts do not wait for the debounce.
      const initial = new Set<HTMLElement>();
      postsIn(root.documentElement ?? (root as unknown as Node), initial);
      initial.forEach(track);
    },

    stop() {
      if (!running) return;
      running = false;
      mutations?.disconnect();
      intersections?.disconnect();
      mutations = null;
      intersections = null;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = new Set();

      for (const dispose of disposers.values()) {
        try {
          dispose();
        } catch (err) {
          log.warn('Disposer threw:', err);
        }
      }
      disposers.clear();
      root.querySelectorAll(`[${PROCESSED_MARKER}]`).forEach((el) => el.removeAttribute(PROCESSED_MARKER));
      tracked = new WeakSet();
      handled = new WeakSet();
    },

    processedCount: () => processed,
  };
}
