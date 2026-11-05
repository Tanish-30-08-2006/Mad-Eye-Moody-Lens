/**
 * ui/lens-button.ts – Vanilla lens button for one post (no React per post).
 *
 * Keyboard accessible, labelled, and it swallows its own click/keys so Reddit's post
 * handlers never see them. States: idle, scanning, done (verdict chip), error.
 */

export type LensState =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'done'; label: 'likely_real' | 'likely_fake' | 'inconclusive'; mock: boolean }
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

/** Magnifier icon built with DOM calls (no innerHTML). */
function createIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '10');
  circle.setAttribute('cy', '10');
  circle.setAttribute('r', '6');
  const handle = document.createElementNS(SVG_NS, 'line');
  handle.setAttribute('x1', '15');
  handle.setAttribute('y1', '15');
  handle.setAttribute('x2', '21');
  handle.setAttribute('y2', '21');
  svg.append(circle, handle);
  return svg;
}

const CHIP_TEXT = { likely_real: 'Real', likely_fake: 'Fake', inconclusive: '?' } as const;
const CHIP_ARIA = {
  likely_real: 'likely real',
  likely_fake: 'likely fake',
  inconclusive: 'inconclusive',
} as const;

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
    button.replaceChildren(createIcon());

    switch (state.kind) {
      case 'idle':
        button.setAttribute('aria-label', 'Scan this post with Moody Lens');
        button.title = 'Scan with Moody Lens';
        break;
      case 'scanning':
        button.setAttribute('aria-label', 'Scanning with Moody Lens');
        button.title = 'Scanning...';
        break;
      case 'done': {
        button.dataset.verdict = state.label;
        const text = document.createElement('span');
        text.textContent = CHIP_TEXT[state.label];
        button.append(text);
        if (state.mock) {
          const demo = document.createElement('span');
          demo.className = 'moody-lens-chip-demo';
          demo.textContent = 'DEMO';
          button.append(demo);
        }
        const aria = `Moody Lens result: ${CHIP_ARIA[state.label]}${state.mock ? ', demo data' : ''}. Open details.`;
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
