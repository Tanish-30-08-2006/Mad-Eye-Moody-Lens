/**
 * ui/popover-host.tsx – Owns the ONE shared React popover for the page.
 *
 * Positions it next to the clicked lens button and closes it on Esc, outside click or
 * navigation (hide()). Runs inside a single shadow host appended to <body>.
 */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { VerdictPopover, type PopoverView } from './VerdictPopover';
import { computePopoverPosition } from './position';

export interface PopoverHandlers {
  onRetry?: () => void;
  onAcceptConsent?: () => void;
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

/** Rough height used for placement before the real size is known. */
const ESTIMATED_SIZE = { width: 320, height: 300 };

export function createPopoverHost(container: HTMLElement): PopoverApi {
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

  const render = () => {
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
    view = null;
    anchor = null;
    handlers = {};
    listen(false);
    render();
  }

  return {
    show(nextView, nextAnchor, nextHandlers = {}) {
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
    isOpen: () => view !== null,
    destroy() {
      listen(false);
      view = null;
      root.unmount();
      mount.remove();
    },
  };
}
