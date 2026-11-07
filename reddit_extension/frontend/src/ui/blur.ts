/**
 * ui/blur.ts – Reversible CSS blur for media judged likely manipulated ("blur until clicked").
 *
 * Only an inline `filter` is added, and the previous value is restored on removal, so Reddit's own
 * styling is never lost.
 */

const BLUR_PX = 24;
const previous = new WeakMap<HTMLElement, string>();

export function applyBlur(elements: HTMLElement[]): void {
  for (const el of elements) {
    if (previous.has(el)) continue;
    previous.set(el, el.style.filter);
    el.style.filter = `blur(${BLUR_PX}px)`;
  }
}

export function removeBlur(elements: HTMLElement[]): void {
  for (const el of elements) {
    const before = previous.get(el);
    if (before === undefined) continue;
    el.style.filter = before;
    previous.delete(el);
  }
}
