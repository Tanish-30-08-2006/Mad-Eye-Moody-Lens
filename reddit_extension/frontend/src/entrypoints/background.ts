/**
 * entrypoints/background.ts – Background Service Worker entrypoint for Moody Lens.
 *
 * MV3 service worker that coordinates runtime message routing, context menu actions,
 * in-flight job resumption, and lifecycle events. All network access occurs here.
 */

import { defineBackground } from 'wxt/utils/define-background';
import { createLogger } from '../core/logger';
import {
  isExtensionMessage,
  isAuthorizedSender,
  type ExtensionResponse,
} from '../core/messaging';
import { handleScanMedia } from '../background/handlers/scan-media';
import {
  setupContextMenu,
  handleContextMenuClick,
} from '../background/handlers/context-menu';
import { getJobStatus } from '../core/api-client';
import { loadSettings } from '../core/settings';
import { restoreInFlightJobs } from '../background/keepalive';
import { pollJobUntilComplete } from '../background/job-poller';

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

  // Resume any in-flight jobs that survived a worker restart
  restoreInFlightJobs()
    .then((inFlightJobs) => {
      for (const job of inFlightJobs) {
        log.info(`Resuming in-flight job ${job.jobId} for post ${job.postId}...`);
        pollJobUntilComplete(job.jobId, {
          postId: job.postId,
          mediaType: job.mediaType,
          initialDelayMs: job.currentDelayMs,
        }).catch((err) => {
          log.warn(`Resumed job ${job.jobId} terminated with:`, err);
        });
      }
    })
    .catch((err) => {
      log.warn('Error during in-flight job restoration:', err);
    });

  // Runtime message dispatcher
  chrome.runtime.onMessage.addListener(
    (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: ExtensionResponse) => void,
    ) => {
      if (!isAuthorizedSender(sender)) {
        log.warn('Rejected unauthorized message sender:', sender);
        sendResponse({ type: 'ERROR', error: 'Unauthorized message sender', code: 'UNAUTHORIZED' });
        return false;
      }

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
                code: 'SCAN_FAILED',
              });
            });
          return true; // Keep channel open for async response
        }

        case 'GET_JOB_STATUS': {
          getJobStatus(message.payload.jobId)
            .then((job) => {
              sendResponse({
                type: 'JOB_STATUS',
                status: job.status,
                result: job,
              });
            })
            .catch((err) => {
              sendResponse({
                type: 'ERROR',
                error: err instanceof Error ? err.message : String(err),
                code: 'FETCH_JOB_FAILED',
              });
            });
          return true;
        }

        case 'CANCEL_JOB': {
          // In v1, cancel acknowledges job cancellation state
          sendResponse({
            type: 'JOB_STATUS',
            status: 'failed',
          });
          return false;
        }

        case 'GET_SETTINGS': {
          loadSettings()
            .then((settings) => {
              sendResponse({
                type: 'SETTINGS',
                settings,
              });
            })
            .catch((err) => {
              sendResponse({
                type: 'ERROR',
                error: err instanceof Error ? err.message : String(err),
              });
            });
          return true;
        }

        default: {
          const _unhandled: never = message;
          return false;
        }
      }
    },
  );
});
