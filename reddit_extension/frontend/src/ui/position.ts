/**
 * ui/position.ts – Pure placement of the popover near an anchor, kept inside the viewport.
 */

export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

const MARGIN = 12;
const GAP = 8;

/** Prefers below the anchor, right-aligned; flips above or clamps when there is no room. */
export function computePopoverPosition(
  anchor: Rect | null,
  popover: Size,
  viewport: Size,
): { top: number; left: number } {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));
  const maxLeft = Math.max(MARGIN, viewport.width - popover.width - MARGIN);
  const maxTop = Math.max(MARGIN, viewport.height - popover.height - MARGIN);

  // No anchor (context-menu results): top-right corner of the viewport.
  if (!anchor) return { top: MARGIN, left: maxLeft };

  const left = clamp(anchor.right - popover.width, MARGIN, maxLeft);
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - popover.height;
  const top = below + popover.height <= viewport.height - MARGIN ? below : above >= MARGIN ? above : maxTop;
  return { top: clamp(top, MARGIN, maxTop), left };
}
