/**
 * content/controller.ts – Glue between the site adapter, the lens buttons and the shared popover.
 *
 * Content scripts only render UI and send typed messages; all network work happens in the
 * service worker. Dependencies are injected so this runs under tests without WXT or Chrome.
 */

import { createLogger, isDebugLogging } from '../core/logger';
import type { SiteAdapter, MediaRef } from '../adapters/types';
import type { ExtensionMessage, ExtensionResponse, ScanOrigin, ShowResultMessage } from '../core/messaging';
import type { ExtensionSettings } from '../core/settings';
import { verdictOf, type Thresholds } from '../core/verdict';
import { applyBlur, removeBlur } from '../ui/blur';
import type { LensButtonHandle } from '../ui/lens-button';
import type { PopoverApi, PopoverHandlers } from '../ui/popover-host';
import type { PopoverView } from '../ui/VerdictPopover';
import type { ResultContext } from '../ui/ResultView';
import { redditPost, type PostSource } from '../core/reddit-context';

const log = createLogger('controller');

/** What the controller needs back from the (WXT) code that mounts a lens into a post. */
export interface MountedLens {
  button: LensButtonHandle;
  remove: () => void;
}

export interface ControllerDeps {
  adapter: SiteAdapter;
  mountLens: (args: {
    post: HTMLElement;
    anchor: HTMLElement;
    postId: string;
    onActivate: (button: HTMLButtonElement) => void;
  }) => Promise<MountedLens>;
  mountShare?: (control: HTMLElement, open: (button: HTMLButtonElement) => void) => Promise<() => void>;
  popover: PopoverApi;
  send: (message: ExtensionMessage) => Promise<ExtensionResponse>;
  getSettings: () => ExtensionSettings;
}

export interface Controller {
  start(): void;
  stop(): void;
  /** Renders a result pushed by the service worker (image context menu). */
  showExternal(payload: ShowResultMessage['payload']): void;
  /** Scans the image posts on screen (popup button); returns how many were queued. */
  scanVisible(): number;
  /** Scans the post nearest the middle of the viewport (keyboard shortcut). */
  scanNearest(): void;
  stats(): { postsSeen: number; lensButtons: number; visibleImages: number };
}

interface PostState {
  lens: MountedLens;
  view: PopoverView | null;
  scanning: boolean;
  /** Elements blurred for this post, so a lens click can reveal them. */
  blurred: HTMLElement[];
  source?: PostSource;
  sourceKey?: string;
  mediaKey?: string;
  mountedId: string;
  mountedPermalink?: string;
  openShare?: boolean;
}

const scopeKey = (media: MediaRef | null) => JSON.stringify([media?.kind, media?.urls, media?.audioUrl]);

/** Maps an extracted ref to the message payload the service worker validates. */
function toPayload(media: MediaRef, origin: ScanOrigin) {
  return {
    mediaUrls: media.urls,
    audioUrl: media.audioUrl,
    postId: media.postId,
    // Absolute URL so the backend's Tier-2 resolver can validate it as a reddit.com permalink.
    permalink: new URL(media.permalink, location.origin).toString(),
    mediaType: media.kind === 'video' || media.kind === 'gif' ? ('video' as const) : ('image' as const),
    kind: media.kind === 'audio' ? undefined : media.kind,
    gallery: media.kind === 'gallery' ? true : undefined,
    origin,
  };
}

function thresholdsOf(settings: ExtensionSettings): Thresholds {
  return { realBelow: settings.realBelow, fakeAbove: settings.fakeAbove };
}

/** True when the subreddit in the permalink is allowed for auto-scan (an empty list allows all). */
function subredditAllowed(permalink: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const match = /\/r\/([^/]+)/i.exec(permalink);
  return !!match && allowed.includes(match[1]!.toLowerCase());
}

export function createController(deps: ControllerDeps): Controller {
  const { adapter, popover, send } = deps;
  const states = new Map<HTMLElement, PostState>();
  /** The post whose scan the popover currently belongs to. */
  let activePost: HTMLElement | null = null;
  let postsSeen = 0;

  const setLens = (post: HTMLElement, state: Parameters<LensButtonHandle['setState']>[0]) => {
    states.get(post)?.lens.button.setState(state);
  };

  const isCurrent = (post: HTMLElement, st: PostState) =>
    states.get(post) === st && adapter.getMountPoint(post)?.postId === st.mountedId
      && adapter.identify(post)?.permalink === st.mountedPermalink;

  const decorate = (post: HTMLElement, st: PostState, view: PopoverView): PopoverView => {
    const media = adapter.extractMedia(post);
    const subreddit = st.source?.current.subreddit?.toLowerCase();
    return {
      ...view,
      source: st.source,
      imageUrl: media?.kind === 'image' ? media.urls[0] : undefined,
      postKey: st.mountedId,
      openShare: st.openShare,
      reviewSubreddit: subreddit && deps.getSettings().reviewSubreddits.includes(subreddit) ? subreddit : undefined,
      postType: media?.kind === 'video' || media?.kind === 'gif' ? 'video' : media ? 'image' : 'unknown',
    };
  };

  const loadSource = (post: HTMLElement, st: PostState, media: MediaRef | null) => {
    const identity = adapter.identify(post);
    const link = identity && redditPost(identity.permalink);
    if (!link) return;
    const imageUrl = media?.kind === 'image' ? media.urls[0] : undefined;
    const key = JSON.stringify([link.permalink, imageUrl, identity.explicit]);
    if (st.sourceKey === key) return;
    st.sourceKey = key;
    const current = { ...link, title: identity.title, flair: identity.flair };
    st.source = { current, originals: identity.explicit ? [{ unavailable: true }] : [] };
    void send({ type: 'GET_POST_SOURCE', payload: { permalink: link.permalink, explicit: !!identity.explicit, imageUrl } })
      .then((response) => {
        if (!isCurrent(post, st) || st.sourceKey !== key || scopeKey(adapter.extractMedia(post)) !== scopeKey(media)) return;
        if (response.type !== 'POST_SOURCE' || !response.source) return;
        const source = response.source;
        st.source = {
          ...source,
          current: { ...current, ...source.current, title: source.current.title ?? current.title, flair: source.current.flair ?? current.flair },
        };
        if (activePost === post && st.view && popover.isOpen()) popover.update(decorate(post, st, st.view));
      })
      .catch(() => { /* Keep the local context if Reddit is unavailable. */ });
  };

  const contextFor = (media: MediaRef | null, post: HTMLElement): ResultContext => ({
    permalink: media ? new URL(media.permalink, location.origin).toString() : adapter.identify(post)?.permalink,
    mediaKind: media && media.kind !== 'audio' ? media.kind : undefined,
    sourceUrls: media ? (media.kind === 'gallery' ? media.urls : media.urls.slice(0, 1)) : undefined,
    disclosedAi: media?.disclosedAi,
  });

  const finish = (post: HTMLElement, view: PopoverView, quiet: boolean, media: MediaRef | null) => {
    const st = states.get(post);
    if (!st) return; // Post was disposed (navigation / removed) while scanning.
    st.scanning = false;
    // A quiet (auto) failure is not worth showing later; keep the lens clean.
    st.view = quiet && view.kind === 'error' ? null : view;
    if (view.kind === 'result') {
      const verdict = verdictOf(view.job, thresholdsOf(deps.getSettings()));
      setLens(post, { kind: 'done', label: verdict, mock: view.job.mock === true, disclosed: media?.disclosedAi });
      // Blur only real findings: demo data must never hide someone's picture.
      if (deps.getSettings().blurManipulated && verdict === 'likely_fake' && view.job.mock !== true) {
        const targets = adapter.mediaElements(post);
        applyBlur(targets);
        st.blurred = targets;
      }
    } else if (view.kind === 'local') {
      setLens(post, { kind: 'local', hints: view.hints.length });
    } else {
      setLens(post, quiet ? { kind: 'idle', localOnly: deps.getSettings().localOnly } : { kind: 'error' });
    }
    if (activePost === post && popover.isOpen()) popover.update(decorate(post, st, view));
  };

  const toView = (response: ExtensionResponse, media: MediaRef | null, post: HTMLElement): PopoverView => {
    const settings = deps.getSettings();
    if (response.type === 'JOB_STATUS' && response.result) {
      return { kind: 'result', job: response.result, meta: response.meta, thresholds: thresholdsOf(settings), context: contextFor(media, post) };
    }
    if (response.type === 'LOCAL_HINTS') return { kind: 'local', hints: response.hints };
    if (response.type === 'ERROR') return { kind: 'error', message: response.error, code: response.code };
    return { kind: 'error', message: 'Unexpected response from the extension.', code: 'SCAN_FAILED' };
  };

  const scan = async (post: HTMLElement, origin: ScanOrigin): Promise<void> => {
    const st = states.get(post);
    if (!st || !isCurrent(post, st) || st.scanning) return;
    const quiet = origin === 'auto' || origin === 'visible';

    const media = adapter.extractMedia(post);
    const key = scopeKey(media);
    st.mediaKey = key;
    if (isDebugLogging()) log.debug('Lens clicked; post debug info:', adapter.describe(post));

    // The page gave us no media for a media post: let the service worker look it up from the post JSON.
    const identity = media ? null : adapter.identify(post);
    if (!media && !identity) {
      if (!quiet) {
        activePost = post;
        const view: PopoverView = { kind: 'error', message: "Couldn't find scannable media in this post.", code: 'NO_MEDIA' };
        st.view = view;
        setLens(post, { kind: 'error' });
        popover.show(decorate(post, st, view), st.lens.button.element, handlersFor(post));
      }
      return;
    }

    st.scanning = true;
    st.view = { kind: 'loading' };
    setLens(post, { kind: 'scanning' });
    if (!quiet) {
      activePost = post;
      popover.show(decorate(post, st, st.view), st.lens.button.element, handlersFor(post));
    }

    const payload = media
      ? toPayload(media, origin)
      : {
          mediaUrls: [],
          postId: identity!.postId,
          permalink: new URL(identity!.permalink, location.origin).toString(),
          mediaType: 'image' as const,
          resolve: true,
          origin,
        };

    let view: PopoverView;
    try {
      view = toView(await send({ type: 'SCAN_MEDIA', payload }), media, post);
    } catch (err) {
      log.debug('SCAN_MEDIA send failed:', err);
      view = { kind: 'error', message: 'The extension could not be reached. Reload the page and try again.', code: 'SCAN_FAILED' };
    }
    if (!isCurrent(post, st)) return;
    if (scopeKey(adapter.extractMedia(post)) !== key) {
      finish(post, { kind: 'error', message: 'This post’s media changed. Scan again for a current result.' }, quiet, null);
      return;
    }
    finish(post, view, quiet, media);
  };

  function handlersFor(post: HTMLElement): PopoverHandlers {
    const st = states.get(post);
    return {
      canCopyEvidence: () => !!st && isCurrent(post, st) &&
        (!st.mediaKey || st.view?.kind !== 'result' || st.mediaKey === scopeKey(adapter.extractMedia(post))),
      loadReviewPolicy: async () => {
        const subreddit = st?.source?.current.subreddit?.toLowerCase();
        if (!st || !subreddit || !isCurrent(post, st)) return null;
        const response = await send({ type: 'GET_COMMUNITY_POLICY', payload: { subreddit } });
        return isCurrent(post, st) && response.type === 'COMMUNITY_POLICY' ? response.policy : null;
      },
      onRetry: () => void scan(post, 'manual'),
      onAcceptConsent: () => {
        void send({ type: 'SET_CONSENT', payload: { accepted: true } })
          .then(() => scan(post, 'manual'))
          .catch((err) => log.warn('Could not save consent:', err));
      },
      onFeedback: feedbackSender,
    };
  }

  const feedbackSender: NonNullable<PopoverHandlers['onFeedback']> = async ({ cacheKey, verdict, label }) => {
    try {
      const response = await send({ type: 'SEND_FEEDBACK', payload: { cacheKey, verdictLabel: verdict, userLabel: label } });
      return response.type === 'OK';
    } catch {
      return false;
    }
  };

  const onActivate = (post: HTMLElement) => {
    const st = states.get(post);
    if (!st || !isCurrent(post, st)) return;
    st.openShare = false;
    const media = adapter.extractMedia(post);
    loadSource(post, st, media);
    if (!st.scanning && st.mediaKey !== undefined && st.mediaKey !== scopeKey(media)) st.view = null;
    if (!st.view && adapter.identify(post)?.explicit) st.view = { kind: 'ready' };
    // Clicking the lens reveals a blurred picture again.
    if (st.blurred.length > 0) {
      removeBlur(st.blurred);
      st.blurred = [];
    }
    // Re-open any finished or in-flight view (result or error details) instead of scanning again.
    if (st.view) {
      activePost = post;
      popover.show(decorate(post, st, st.view), st.lens.button.element, handlersFor(post));
      return;
    }
    void scan(post, 'manual');
  };

  const dropState = (post: HTMLElement) => {
    const st = states.get(post);
    if (st) removeBlur(st.blurred);
    states.delete(post);
  };

  const clearAll = () => {
    for (const post of Array.from(states.keys())) dropState(post);
  };

  const isOnScreen = (post: HTMLElement) => {
    const rect = post.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight && rect.height > 0;
  };

  /** Image posts on screen that have not been scanned yet. */
  const visibleImagePosts = () =>
    Array.from(states.entries())
      .filter(([post, st]) => {
        if (st.view || st.scanning || !isOnScreen(post)) return false;
        const media = adapter.extractMedia(post);
        return !!media && (media.kind === 'image' || media.kind === 'gallery');
      })
      .map(([post]) => post);

  const onPost = (post: HTMLElement) => {
    postsSeen++;
    // Media posts get a lens; text/link posts do not. Extraction can also succeed for unknown types.
    if (!adapter.isMediaPost(post) && !adapter.extractMedia(post)) return;
    const mount = adapter.getMountPoint(post);
    if (!mount) return;

    let disposed = false;
    let mounted: MountedLens | null = null;
    let removeShare: (() => void) | undefined;

    deps
      .mountLens({
        post,
        anchor: mount.anchorElement,
        postId: mount.postId,
        onActivate: () => onActivate(post),
      })
      .then((lens) => {
        if (disposed) {
          lens.remove();
          return;
        }
        mounted = lens;
        const identity = adapter.identify(post);
        const st: PostState = { lens, view: null, scanning: false, blurred: [], mountedId: mount.postId, mountedPermalink: identity?.permalink };
        states.set(post, st);
        const share = identity && adapter.shareControl?.(post);
        if (share && deps.mountShare && redditPost(identity.permalink)) {
          void deps.mountShare(share, (button) => {
            if (!isCurrent(post, st)) return;
            const media = adapter.extractMedia(post);
            loadSource(post, st, media);
            if (!st.scanning && st.mediaKey !== undefined && st.mediaKey !== scopeKey(media)) st.view = null;
            st.openShare = true;
            st.view ??= { kind: 'ready' };
            activePost = post;
            popover.show(decorate(post, st, st.view), button, handlersFor(post));
          }).then((remove) => {
            if (disposed) remove();
            else removeShare = remove;
          }).catch(() => { /* The Lens remains the stable Share entry point. */ });
        }
        const settings = deps.getSettings();
        if (settings.localOnly) lens.button.setState({ kind: 'idle', localOnly: true });

        // Auto-scan: visible images only (the observer already limits us to on-screen posts),
        // in the subreddits the user allowed (all of them when the list is empty).
        const media = adapter.extractMedia(post);
        if (
          settings.enableAutoScan &&
          !settings.localOnly &&
          media &&
          (media.kind === 'image' || media.kind === 'gallery') &&
          subredditAllowed(media.permalink, settings.autoScanSubreddits)
        ) {
          void scan(post, 'auto');
        }
      })
      .catch((err) => log.warn('Could not mount lens button:', err));

    return () => {
      disposed = true;
      if (activePost === post) {
        popover.hide();
        activePost = null;
      }
      dropState(post);
      mounted?.remove();
      removeShare?.();
    };
  };

  return {
    start() {
      adapter.observe(onPost, () => {
        // SPA navigation: the observer already disposed every lens; close the popover too.
        popover.hide();
        activePost = null;
        clearAll();
        postsSeen = 0;
      });
    },
    stop() {
      adapter.disconnect();
      popover.hide();
      activePost = null;
      clearAll();
    },
    showExternal(payload) {
      activePost = null;
      const settings = deps.getSettings();
      const view: PopoverView =
        payload.state === 'loading'
          ? { kind: 'loading' }
          : payload.state === 'result'
            ? { kind: 'result', job: payload.job, meta: payload.meta, thresholds: thresholdsOf(settings), context: {} }
            : payload.state === 'local'
              ? { kind: 'local', hints: payload.hints }
              : { kind: 'error', message: payload.message, code: payload.code };
      popover.show(view, null, {
        onAcceptConsent: () => {
          void send({ type: 'SET_CONSENT', payload: { accepted: true } })
            .then(() =>
              popover.show(
                { kind: 'error', message: 'Saved. Right-click the image and choose Scan again.' },
                null,
              ),
            )
            .catch((err) => log.warn('Could not save consent:', err));
        },
        onFeedback: feedbackSender,
      });
    },
    scanVisible() {
      const posts = visibleImagePosts();
      for (const post of posts) void scan(post, 'visible');
      return posts.length;
    },
    scanNearest() {
      const middle = window.innerHeight / 2;
      let best: { post: HTMLElement; distance: number } | null = null;
      for (const post of states.keys()) {
        if (!isOnScreen(post)) continue;
        const rect = post.getBoundingClientRect();
        const distance = Math.abs((rect.top + rect.bottom) / 2 - middle);
        if (!best || distance < best.distance) best = { post, distance };
      }
      if (best) onActivate(best.post);
    },
    stats: () => ({ postsSeen, lensButtons: states.size, visibleImages: visibleImagePosts().length }),
  };
}
