/**
 * ui/popover-host.tsx – Owns the ONE shared React popover for the page.
 *
 * Positions it next to the clicked lens button and closes it on Esc, outside click or
 * navigation (hide()). Runs inside a single shadow host appended to <body>.
 */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { VerdictPopover, type PopoverView, type VerdictPopoverProps } from './VerdictPopover';
import { computePopoverPosition } from './position';

export interface PopoverHandlers {
  onRetry?: () => void;
  onAcceptConsent?: () => void;
  onFeedback?: VerdictPopoverProps['onFeedback'];
}

/** The surface the content-script controller talks to. */
export interface PopoverApi {
  /** Opens (or re-opens) the popover near `anchor`; null anchor = top-right of the viewport. */
  show(view: PopoverView, anchor: HTMLElement | null, handlers?: PopoverHandlers): void;
  /** Swaps the content of an already-open popover. No-op when closed. */
  update(view: PopoverView): void;
  hide(): void;
  isOpen(): boolean;
  destroy(): void;
}

/** Rough size used for placement before the real size is known (the popover is at most 360px wide). */
const ESTIMATED_SIZE = { width: 360, height: 420 };

export interface PopoverHostOptions {
  /** How long the closing animation plays before unmounting; 0 closes immediately. */
  exitMs?: number;
}

export function createPopoverHost(container: HTMLElement, options: PopoverHostOptions = {}): PopoverApi {
  const exitMs = options.exitMs ?? 0;
  let exitTimer: ReturnType<typeof setTimeout> | null = null;
  const mount = document.createElement('div');
  container.appendChild(mount);
  const root: Root = createRoot(mount);

  let view: PopoverView | null = null;
  let anchor: HTMLElement | null = null;
  let handlers: PopoverHandlers = {};
  let listening = false;

  // The shadow host is what shows up in event paths for clicks inside the popover.
  const selfHost = (): Node => {
    const rootNode = container.getRootNode();
    return rootNode instanceof ShadowRoot ? rootNode.host : container;
  };

  // `closing` keeps the last view on screen while the fade-out plays.
  const render = (closing = false) => {
    if (!view) {
      root.render(null);
      return;
    }
    const rect = anchor?.getBoundingClientRect() ?? null;
    const position = computePopoverPosition(rect, ESTIMATED_SIZE, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    root.render(
      <VerdictPopover
        view={view}
        position={position}
        onClose={hide}
        onRetry={handlers.onRetry}
        onAcceptConsent={handlers.onAcceptConsent}
        onFeedback={handlers.onFeedback}
        closing={closing}
      />,
    );
  };

  // Close on outside pointer-down. Clicks on the anchor lens are left to the controller (toggle/reopen).
  const onPointerDown = (event: Event) => {
    const path = event.composedPath();
    if (path.includes(selfHost()) || (anchor && path.includes(anchor))) return;
    // The lens button lives in its own shadow host; ignore clicks that land in any lens host.
    if (path.some((n) => n instanceof Element && n.localName === 'moody-lens-button-host')) return;
    hide();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    const returnTo = anchor;
    hide();
    returnTo?.focus();
  };

  const listen = (on: boolean) => {
    if (on === listening) return;
    listening = on;
    if (on) {
      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('keydown', onKeyDown, true);
    } else {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    }
  };

  function hide() {
    listen(false);
    if (exitMs > 0 && view) {
      // Fade out first, then unmount; the view state is cleared at the end.
      render(true);
      exitTimer ??= setTimeout(() => {
        exitTimer = null;
        view = null;
        anchor = null;
        handlers = {};
        render();
      }, exitMs);
      return;
    }
    view = null;
    anchor = null;
    handlers = {};
    render();
  }

  return {
    show(nextView, nextAnchor, nextHandlers = {}) {
      if (exitTimer) {
        clearTimeout(exitTimer);
        exitTimer = null;
      }
      view = nextView;
      anchor = nextAnchor;
      handlers = nextHandlers;
      listen(true);
      render();
    },
    update(nextView) {
      if (!view) return;
      view = nextView;
      render();
    },
    hide,
    isOpen: () => view !== null && exitTimer === null,
    destroy() {
      if (exitTimer) clearTimeout(exitTimer);
      listen(false);
      view = null;
      root.unmount();
      mount.remove();
    },
  };
}
