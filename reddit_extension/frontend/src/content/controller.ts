/**
 * content/controller.ts – Glue between the site adapter, the lens buttons and the shared popover.
 *
 * Content scripts only render UI and send typed messages; all network work happens in the
 * service worker. Dependencies are injected so this runs under tests without WXT or Chrome.
 */

import { createLogger, isDebugLogging } from '../core/logger';
import type { SiteAdapter, MediaRef } from '../adapters/types';
import type { ExtensionMessage, ExtensionResponse, ScanOrigin, ShowResultMessage } from '../core/messaging';
import type { DetectionJob } from '../core/schema';
import type { ExtensionSettings } from '../core/settings';
import type { LensButtonHandle } from '../ui/lens-button';
import type { PopoverApi } from '../ui/popover-host';
import type { PopoverView } from '../ui/VerdictPopover';

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
  popover: PopoverApi;
  send: (message: ExtensionMessage) => Promise<ExtensionResponse>;
  getSettings: () => ExtensionSettings;
}

export interface Controller {
  start(): void;
  stop(): void;
  /** Renders a result pushed by the service worker (image context menu). */
  showExternal(payload: ShowResultMessage['payload']): void;
  stats(): { postsSeen: number; lensButtons: number };
}

interface PostState {
  lens: MountedLens;
  view: PopoverView | null;
  scanning: boolean;
}

/** Maps an extracted ref to the message payload the service worker validates. */
function toPayload(media: MediaRef, origin: ScanOrigin) {
  return {
    mediaUrls: media.urls,
    audioUrl: media.audioUrl,
    postId: media.postId,
    // Absolute URL so the backend's Tier-2 resolver can validate it as a reddit.com permalink.
    permalink: new URL(media.permalink, location.origin).toString(),
    mediaType: media.kind === 'video' || media.kind === 'gif' ? ('video' as const) : ('image' as const),
    origin,
  };
}

function labelOf(job: DetectionJob) {
  return job.label ?? 'inconclusive';
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

  const finish = (post: HTMLElement, view: PopoverView, quiet: boolean) => {
    const st = states.get(post);
    if (!st) return; // Post was disposed (navigation / removed) while scanning.
    st.scanning = false;
    // A quiet (auto) failure is not worth showing later; keep the lens clean.
    st.view = quiet && view.kind === 'error' ? null : view;
    if (view.kind === 'result') {
      setLens(post, { kind: 'done', label: labelOf(view.job), mock: view.job.mock === true });
    } else {
      setLens(post, quiet ? { kind: 'idle' } : { kind: 'error' });
    }
    if (!quiet && activePost === post) popover.update(view);
  };

  const scan = async (post: HTMLElement, origin: ScanOrigin): Promise<void> => {
    const st = states.get(post);
    if (!st || st.scanning) return;
    const quiet = origin === 'auto';

    const media = adapter.extractMedia(post);
    if (isDebugLogging()) log.debug('Lens clicked; post debug info:', adapter.describe(post));

    if (!media) {
      if (!quiet) {
        activePost = post;
        const view: PopoverView = { kind: 'error', message: "Couldn't find scannable media in this post.", code: 'NO_MEDIA' };
        st.view = view;
        setLens(post, { kind: 'error' });
        popover.show(view, st.lens.button.element, handlersFor(post));
      }
      return;
    }

    st.scanning = true;
    st.view = { kind: 'loading' };
    setLens(post, { kind: 'scanning' });
    if (!quiet) {
      activePost = post;
      popover.show(st.view, st.lens.button.element, handlersFor(post));
    }

    let view: PopoverView;
    try {
      const response = await send({ type: 'SCAN_MEDIA', payload: toPayload(media, origin) });
      if (response.type === 'JOB_STATUS' && response.result) {
        view = { kind: 'result', job: response.result };
      } else if (response.type === 'ERROR') {
        view = { kind: 'error', message: response.error, code: response.code };
      } else {
        view = { kind: 'error', message: 'Unexpected response from the extension.', code: 'SCAN_FAILED' };
      }
    } catch (err) {
      log.debug('SCAN_MEDIA send failed:', err);
      view = { kind: 'error', message: 'The extension could not be reached. Reload the page and try again.', code: 'SCAN_FAILED' };
    }
    finish(post, view, quiet);
  };

  function handlersFor(post: HTMLElement) {
    return {
      onRetry: () => void scan(post, 'manual'),
      onAcceptConsent: () => {
        void send({ type: 'SET_CONSENT', payload: { accepted: true } })
          .then(() => scan(post, 'manual'))
          .catch((err) => log.warn('Could not save consent:', err));
      },
    };
  }

  const onActivate = (post: HTMLElement) => {
    const st = states.get(post);
    if (!st) return;
    // Re-open any finished or in-flight view (result or error details) instead of scanning again.
    if (st.view) {
      activePost = post;
      popover.show(st.view, st.lens.button.element, handlersFor(post));
      return;
    }
    void scan(post, 'manual');
  };

  const onPost = (post: HTMLElement) => {
    postsSeen++;
    // Media posts get a lens; text/link posts do not. Extraction can also succeed for unknown types.
    if (!adapter.isMediaPost(post) && !adapter.extractMedia(post)) return;
    const mount = adapter.getMountPoint(post);
    if (!mount) return;

    let disposed = false;
    let mounted: MountedLens | null = null;

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
        states.set(post, { lens, view: null, scanning: false });

        // Auto-scan: visible images only (the observer already limits us to on-screen posts).
        const media = adapter.extractMedia(post);
        if (deps.getSettings().enableAutoScan && media && (media.kind === 'image' || media.kind === 'gallery')) {
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
      states.delete(post);
      mounted?.remove();
    };
  };

  return {
    start() {
      adapter.observe(onPost, () => {
        // SPA navigation: the observer already disposed every lens; close the popover too.
        popover.hide();
        activePost = null;
        states.clear();
        postsSeen = 0;
      });
    },
    stop() {
      adapter.disconnect();
      popover.hide();
      activePost = null;
      states.clear();
    },
    showExternal(payload) {
      activePost = null;
      const view: PopoverView =
        payload.state === 'loading'
          ? { kind: 'loading' }
          : payload.state === 'result'
            ? { kind: 'result', job: payload.job }
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
      });
    },
    stats: () => ({ postsSeen, lensButtons: states.size }),
  };
}
