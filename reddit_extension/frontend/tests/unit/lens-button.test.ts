// @vitest-environment happy-dom
/**
 * tests/unit/lens-button.test.ts – Lens button: keyboard use, ARIA, states, no event leakage.
 * Label: RUNTIME (happy-dom).
 */
import { describe, it, expect, vi } from 'vitest';
import { createLensButton } from '../../src/ui/lens-button';

function setup() {
  const onActivate = vi.fn();
  const lens = createLensButton({ postId: 't3_x', onActivate });
  const postClick = vi.fn();
  const postKey = vi.fn();
  const post = document.createElement('div');
  post.addEventListener('click', postClick);
  post.addEventListener('keydown', postKey);
  post.appendChild(lens.element);
  document.body.appendChild(post);
  return { lens, onActivate, postClick, postKey };
}

describe('createLensButton', () => {
  it('is a labelled <button> in the idle state', () => {
    const { lens } = setup();
    expect(lens.element.tagName).toBe('BUTTON');
    expect(lens.element.getAttribute('aria-label')).toBeTruthy();
    expect(lens.element.dataset.state).toBe('idle');
  });

  it('activates on click without letting the post see the click', () => {
    const { lens, onActivate, postClick } = setup();
    lens.element.click();
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(postClick).not.toHaveBeenCalled();
  });

  it('activates exactly once on Enter and on Space, without leaking keys to the page', () => {
    const { lens, onActivate, postKey } = setup();
    for (const key of ['Enter', ' ']) {
      lens.element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      lens.element.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
    }
    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(postKey).not.toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    const { lens, onActivate } = setup();
    lens.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('reflects scanning, done (with DEMO), and error states in markup and aria', () => {
    const { lens } = setup();
    lens.setState({ kind: 'scanning' });
    expect(lens.element.getAttribute('aria-busy')).toBe('true');

    lens.setState({ kind: 'done', label: 'likely_fake', mock: true });
    expect(lens.element.dataset.verdict).toBe('likely_fake');
    expect(lens.element.textContent).toContain('Fake');
    expect(lens.element.textContent).toContain('DEMO');
    expect(lens.element.getAttribute('aria-label')).toContain('demo data');

    lens.setState({ kind: 'error' });
    expect(lens.element.dataset.state).toBe('error');
    expect(lens.element.dataset.verdict).toBeUndefined();

    lens.setState({ kind: 'idle' });
    expect(lens.element.getAttribute('aria-busy')).toBe('false');
  });
});
