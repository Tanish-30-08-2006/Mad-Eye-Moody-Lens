/**
 * background/handlers/context-menu.ts – Context menu integration for direct image scans.
 *
 * Registers a right-click "Scan with Moody Lens" menu item on image elements.
 * Skips video context menus because Reddit <video> elements lack direct usable source URLs.
 *
 * TODO: Implement context menu creation and click handling in Phase 3.
 */

import { createLogger } from '../../core/logger';

const log = createLogger('context-menu');

export const CONTEXT_MENU_ID = 'moody-lens-scan-image';

/**
 * Initialize context menu items.
 * TODO: Wire up chrome.contextMenus.create in Phase 3.
 */
export function setupContextMenu(): void {
  log.info('Setting up context menu items (stub)');

  if (typeof chrome !== 'undefined' && chrome.contextMenus) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: 'Scan image with Moody Lens',
        contexts: ['image'],
      });
    });
  }
}

/**
 * Handle clicks on Moody Lens context menu items.
 * TODO: Forward target image URL to scan handler in Phase 3.
 */
export function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
): void {
  log.info(`Context menu clicked on tab ${tab?.id} (stub):`, info.srcUrl);
  // TODO: Phase 3 – Dispatch scan for info.srcUrl
}
