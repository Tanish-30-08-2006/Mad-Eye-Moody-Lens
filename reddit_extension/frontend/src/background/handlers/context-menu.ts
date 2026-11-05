/**
 * background/handlers/context-menu.ts – Right-click "Scan image with Moody Lens".
 *
 * Images only: a Reddit <video> has no usable source URL. Scans go through the same
 * queue as the lens button; the result is shown in the page popover, or as a toolbar
 * badge when the page has no content script (no notifications permission needed).
 */

import { createLogger } from '../../core/logger';
import { hashUrl } from '../../core/cache';
import { isAllowedMediaUrl } from '../media-fetcher';
import { handleScanMedia } from './scan-media';
import type { ExtensionResponse, ShowResultMessage } from '../../core/messaging';

const log = createLogger('context-menu');

export const CONTEXT_MENU_ID = 'moody-lens-scan-image';

/** Registers the image-only context menu item. */
export function setupContextMenu(): void {
  if (typeof chrome === 'undefined' || !chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Scan image with Moody Lens',
      contexts: ['image'],
    });
  });
}

/** Sends a message to the page's content script; false when nothing is listening. */
async function sendToTab(tabId: number, message: ShowResultMessage): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch {
    return false;
  }
}

/** Notification-free fallback: a short badge on the toolbar icon for this tab. */
function showBadge(tabId: number, response: ExtensionResponse): void {
  let text = '!';
  if (response.type === 'JOB_STATUS' && response.result?.label) {
    // Question marks keep the badge probabilistic.
    text = response.result.label === 'likely_fake' ? 'FAKE?' : response.result.label === 'likely_real' ? 'REAL?' : '?';
  } else if (response.type === 'LOCAL_HINTS') {
    text = response.hints.length > 0 ? 'META' : '-';
  }
  try {
    void chrome.action.setBadgeText({ tabId, text });
    setTimeout(() => void chrome.action.setBadgeText({ tabId, text: '' }), 10_000);
  } catch (err) {
    log.warn('Could not set badge:', err);
  }
}

/** Builds the page message for a scan outcome. */
function toShowResult(response: ExtensionResponse): ShowResultMessage {
  if (response.type === 'JOB_STATUS' && response.result) {
    return { type: 'SHOW_RESULT', payload: { state: 'result', job: response.result, meta: response.meta } };
  }
  if (response.type === 'LOCAL_HINTS') return { type: 'SHOW_RESULT', payload: { state: 'local', hints: response.hints } };
  const message = response.type === 'ERROR' ? response.error : 'Scan did not return a result.';
  const code = response.type === 'ERROR' ? response.code : undefined;
  return { type: 'SHOW_RESULT', payload: { state: 'error', message, code } };
}

/**
 * Handle clicks on Moody Lens context menu items.
 */
export async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
): Promise<void> {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;

  const srcUrl = info.srcUrl;
  if (!srcUrl || !isAllowedMediaUrl(srcUrl)) {
    log.warn('Context menu target is missing or not on the media allowlist.');
    return;
  }

  const tabId = tab?.id;
  if (tabId !== undefined) await sendToTab(tabId, { type: 'SHOW_RESULT', payload: { state: 'loading' } });

  const response = await handleScanMedia({
    type: 'SCAN_MEDIA',
    payload: {
      mediaUrls: [srcUrl],
      // Stable id per image so repeated clicks hit the cache and the in-flight dedupe.
      postId: `ctx_${hashUrl(srcUrl)}`,
      permalink: tab?.url || srcUrl,
      mediaType: 'image',
      kind: 'image',
      origin: 'context-menu',
    },
  });

  if (tabId === undefined) return;
  const delivered = await sendToTab(tabId, toShowResult(response));
  if (!delivered) showBadge(tabId, response);
}
