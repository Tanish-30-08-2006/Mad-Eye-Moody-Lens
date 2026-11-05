// @vitest-environment happy-dom
/**
 * tests/unit/popover-host.test.tsx – Shared popover host: single instance, Esc/outside close, placement.
 * Label: RUNTIME (React + happy-dom).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createPopoverHost } from '../../src/ui/popover-host';
import { computePopoverPosition } from '../../src/ui/position';
import { act } from '../helpers/react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: ReturnType<typeof createPopoverHost> | null = null;
afterEach(async () => {
  await act(async () => host?.destroy());
  host = null;
  document.body.innerHTML = '';
});

function setup() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  host = createPopoverHost(container);
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  return { container, anchor, host };
}

describe('createPopoverHost', () => {
  it('renders one popover at a time, even when shown for different anchors', async () => {
    const { container, anchor } = setup();
    const other = document.createElement('button');
    document.body.appendChild(other);
    await act(async () => host!.show({ kind: 'loading' }, anchor));
    await act(async () => host!.show({ kind: 'loading' }, other));
    expect(container.querySelectorAll('.moody-lens-popover')).toHaveLength(1);
    expect(host!.isOpen()).toBe(true);
  });

  it('closes on Escape and returns focus to the anchor', async () => {
    const { container, anchor } = setup();
    await act(async () => host!.show({ kind: 'loading' }, anchor));
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(container.querySelector('.moody-lens-popover')).toBeNull();
    expect(host!.isOpen()).toBe(false);
    expect(document.activeElement).toBe(anchor);
  });

  it('closes on an outside pointer-down but not inside the popover or on the anchor', async () => {
    const { container, anchor } = setup();
    await act(async () => host!.show({ kind: 'loading' }, anchor));

    await act(async () => {
      container.querySelector('.moody-lens-popover')!.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    });
    expect(host!.isOpen()).toBe(true);

    await act(async () => {
      anchor.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    });
    expect(host!.isOpen()).toBe(true);

    await act(async () => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    });
    expect(host!.isOpen()).toBe(false);
  });

  it('update() swaps content while open and is a no-op when closed', async () => {
    const { container, anchor } = setup();
    await act(async () => host!.update({ kind: 'error', message: 'x' }));
    expect(container.querySelector('.moody-lens-popover')).toBeNull();
    await act(async () => host!.show({ kind: 'loading' }, anchor));
    await act(async () => host!.update({ kind: 'error', message: 'Boom' }));
    expect(container.textContent).toContain('Boom');
  });

  it('removes its document listeners on hide', async () => {
    const { anchor } = setup();
    await act(async () => host!.show({ kind: 'loading' }, anchor));
    await act(async () => host!.hide());
    // After hide, Escape must not throw or reopen anything.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host!.isOpen()).toBe(false);
  });
});

describe('computePopoverPosition', () => {
  const vp = { width: 1000, height: 800 };
  const size = { width: 320, height: 300 };

  it('places below and right-aligned with the anchor', () => {
    const pos = computePopoverPosition({ top: 100, left: 600, right: 640, bottom: 132 }, size, vp);
    expect(pos).toEqual({ top: 140, left: 320 });
  });

  it('flips above when there is no room below', () => {
    const pos = computePopoverPosition({ top: 700, left: 600, right: 640, bottom: 732 }, size, vp);
    expect(pos.top).toBe(700 - 8 - 300);
  });

  it('clamps inside the viewport and handles a null anchor', () => {
    expect(computePopoverPosition({ top: 10, left: 0, right: 20, bottom: 40 }, size, vp).left).toBe(12);
    expect(computePopoverPosition(null, size, vp)).toEqual({ top: 12, left: 668 });
  });
});
