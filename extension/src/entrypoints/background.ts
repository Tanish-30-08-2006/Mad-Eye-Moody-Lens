/**
 * entrypoints/background.ts – Background Service Worker entrypoint for Moody Lens.
 *
 * MV3 service worker that wires together runtime message handlers,
 * context menu actions, and lifecycle events. All network access occurs here.
 */

import { defineBackground } from 'wxt/utils/define-background';
import { createLogger } from '../core/logger';
import {
  isExtensionMessage,
  type ExtensionResponse,
} from '../core/messaging';
import { handleScanMedia } from '../background/handlers/scan-media';
import {
  setupContextMenu,
  handleContextMenuClick,
} from '../background/handlers/context-menu';

const log = createLogger('background');

export default defineBackground(() => {
  log.info('Moody Lens service worker initialized.');

  // Initialize context menus
  try {
    setupContextMenu();
  } catch (err) {
    log.warn('Could not setup context menus:', err);
  }

  // Context menu click listener
  if (typeof chrome !== 'undefined' && chrome.contextMenus?.onClicked) {
    chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
  }

  // Runtime message dispatcher
  chrome.runtime.onMessage.addListener(
    (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: ExtensionResponse) => void,
    ) => {
      if (!isExtensionMessage(message)) {
        return false;
      }

      log.debug('Received extension message:', message.type, 'from tab:', sender.tab?.id);

      switch (message.type) {
        case 'PING': {
          sendResponse({
            type: 'PONG',
            timestamp: Date.now(),
          });
          return false;
        }

        case 'SCAN_MEDIA': {
          handleScanMedia(message)
            .then(sendResponse)
            .catch((err) => {
              log.error('Error handling scan media:', err);
              sendResponse({
                type: 'ERROR',
                error: err instanceof Error ? err.message : String(err),
              });
            });
          return true; // Keep channel open for async response
        }

        case 'GET_JOB_STATUS': {
          // TODO: Phase 3 – Query job status from memory / cache / backend
          sendResponse({
            type: 'JOB_STATUS',
            status: 'processing',
          });
          return false;
        }

        case 'CANCEL_JOB': {
          // TODO: Phase 3 – Abort active fetch / poller
          sendResponse({
            type: 'JOB_STATUS',
            status: 'failed',
          });
          return false;
        }

        case 'GET_SETTINGS': {
          // TODO: Phase 7 – Return synchronized settings
          return false;
        }

        default: {
          const _unhandled: never = message;
          return false;
        }
      }
    },
  );
});
