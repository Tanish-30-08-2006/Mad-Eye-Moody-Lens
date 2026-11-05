/**
 * ui/lens-button.ts – Vanilla lens button for one post (no React per post).
 *
 * Keyboard accessible, labelled, and it swallows its own click/keys so Reddit's post
 * handlers never see them. States: idle, scanning, done (verdict dot + chip), local, error.
 */

import { VERDICT_TEXT, type Verdict } from '../core/verdict';

export type LensState =
  | { kind: 'idle'; localOnly?: boolean }
  | { kind: 'scanning' }
  | { kind: 'done'; label: Verdict; mock: boolean; /** The author disclosed the post as AI-made. */ disclosed?: boolean }
  | { kind: 'local'; hints: number }
  | { kind: 'error' };

export interface LensButtonOptions {
  postId: string;
  /** Fired on click, Enter or Space. */
  onActivate: (button: HTMLButtonElement) => void;
}

export interface LensButtonHandle {
  element: HTMLButtonElement;
  setState: (state: LensState) => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Eye/lens icon built with DOM calls (no innerHTML); drawn in currentColor. */
function createIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const eye = document.createElementNS(SVG_NS, 'path');
  eye.setAttribute('d', 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z');
  const pupil = document.createElementNS(SVG_NS, 'circle');
  pupil.setAttribute('cx', '12');
  pupil.setAttribute('cy', '12');
  pupil.setAttribute('r', '3.2');
  svg.append(eye, pupil);
  return svg;
}

function span(className: string, text = ''): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

export function createLensButton(options: LensButtonOptions): LensButtonHandle {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'moody-lens-btn';
  button.dataset.postId = options.postId;

  const activate = () => options.onActivate(button);

  button.addEventListener('click', (event) => {
    // The button sits on top of a clickable post: keep the click from navigating.
    event.preventDefault();
    event.stopPropagation();
    activate();
  });

  // Handle Enter/Space ourselves so the key never reaches Reddit's keyboard shortcuts.
  button.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  });
  button.addEventListener('keyup', (event) => {
    event.stopPropagation();
    // Space would otherwise fire a native click on keyup, double-activating.
    if (event.key === ' ') event.preventDefault();
  });

  const setState = (state: LensState) => {
    button.dataset.state = state.kind;
    button.setAttribute('aria-busy', String(state.kind === 'scanning'));
    delete button.dataset.verdict;
    delete button.dataset.mock;
    button.replaceChildren(createIcon());

    switch (state.kind) {
      case 'idle': {
        const label = state.localOnly ? 'Check this post locally with Moody Lens (metadata only, nothing is uploaded)' : 'Scan this post with Moody Lens';
        button.setAttribute('aria-label', label);
        button.title = state.localOnly ? 'Local check (nothing uploaded)' : 'Scan with Moody Lens';
        break;
      }
      case 'scanning':
        button.setAttribute('aria-label', 'Scanning with Moody Lens');
        button.title = 'Scanning...';
        break;
      case 'done': {
        button.dataset.verdict = state.disclosed ? 'disclosed' : state.label;
        if (state.mock) button.dataset.mock = 'true';
        const chip = state.disclosed ? 'Disclosed as AI' : VERDICT_TEXT[state.label];
        button.append(span('moody-lens-btn-dot'), span('moody-lens-chip-label', state.mock ? `${chip} · DEMO` : chip));
        const aria = `Moody Lens result: ${chip.toLowerCase()}${state.mock ? ', demo data' : ''}. Open details.`;
        button.setAttribute('aria-label', aria);
        button.title = aria;
        break;
      }
      case 'local': {
        button.append(span('moody-lens-btn-dot'), span('moody-lens-chip-label', 'Local scan'));
        const aria = `Moody Lens local check: ${state.hints} metadata hint${state.hints === 1 ? '' : 's'}, nothing uploaded. Open details.`;
        button.setAttribute('aria-label', aria);
        button.title = aria;
        break;
      }
      case 'error':
        button.setAttribute('aria-label', 'Moody Lens scan failed. Open details.');
        button.title = 'Scan failed';
        break;
    }
  };

  setState({ kind: 'idle' });
  return { element: button, setState };
}
