/**
 * background/handlers/context-menu.ts – Context menu integration for direct image scans.
 *
 * Registers a right-click "Scan image with Moody Lens" menu item on image elements ONLY.
 * Skips video context menus because Reddit <video> elements lack direct usable source URLs.
 */

import { createLogger } from '../../core/logger';
import { isAllowedMediaUrl } from '../media-fetcher';
import { handleScanMedia } from './scan-media';

const log = createLogger('context-menu');

export const CONTEXT_MENU_ID = 'moody-lens-scan-image';

/**
 * Initialize context menu item for IMAGE context only.
 */
export function setupContextMenu(): void {
  log.info('Setting up context menu items');

  if (typeof chrome !== 'undefined' && chrome.contextMenus) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: 'Scan image with Moody Lens',
        contexts: ['image'], // Strict: images only, NO video
      });
    });
  }
}

/**
 * Handle clicks on Moody Lens context menu items.
 * Validates allowlist and dispatches scan.
 */
export async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
): Promise<void> {
  if (info.menuItemId !== CONTEXT_MENU_ID) {
    return;
  }

  const srcUrl = info.srcUrl;
  if (!srcUrl) {
    log.warn('Context menu click has no srcUrl');
    return;
  }

  log.info(`Context menu clicked on tab ${tab?.id} for URL: ${srcUrl}`);

  if (!isAllowedMediaUrl(srcUrl)) {
    log.warn(`Context menu target URL not on media allowlist: ${srcUrl}`);
    return;
  }

  try {
    const response = await handleScanMedia({
      type: 'SCAN_MEDIA',
      payload: {
        mediaUrls: [srcUrl],
        postId: `context_menu_${Date.now()}`,
        permalink: tab?.url || srcUrl,
        mediaType: 'image',
      },
    });
    log.info('Context menu scan completed:', response);
  } catch (err) {
    log.error('Context menu scan failed:', err);
  }
}
