/**
 * entrypoints/reddit.content/index.tsx – Content script for www.reddit.com and sh.reddit.com.
 *
 * Renders UI only: one shadow-root lens button per media post and ONE shared popover.
 * All network work is delegated to the service worker through typed messages.
 */

import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createLogger } from '../../core/logger';
import { bindDebugToSettings } from '../../core/debug';
import { sendMessage, isTabMessage, type PageStatusResponse } from '../../core/messaging';
import { DEFAULT_SETTINGS, loadSettings, SETTINGS_KEY, type ExtensionSettings } from '../../core/settings';
import { redditAdapter } from '../../adapters/reddit';
import { createLensButton } from '../../ui/lens-button';
import { createPopoverHost, type PopoverApi } from '../../ui/popover-host';
import { createController } from '../../content/controller';
import '../../ui/styles.css';

const log = createLogger('content');

/** Gives the lens host a positioned parent; returns a function that undoes the change. */
function ensurePositioned(anchor: HTMLElement): () => void {
  if (getComputedStyle(anchor).position !== 'static') return () => {};
  anchor.style.position = 'relative';
  return () => {
    anchor.style.position = '';
  };
}

export default defineContentScript({
  matches: ['https://www.reddit.com/*', 'https://sh.reddit.com/*'],
  cssInjectionMode: 'ui',

  async main(ctx: ContentScriptContext) {
    log.info('Moody Lens content script loaded on Reddit.');
    void bindDebugToSettings();

    // Keep a live copy of the settings the controller reads synchronously.
    let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
    void loadSettings().then((s) => (settings = s));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[SETTINGS_KEY]) void loadSettings().then((s) => (settings = s));
    });

    // The single shared popover lives in one shadow host on <body>.
    const popoverUi = await createShadowRootUi<PopoverApi>(ctx, {
      name: 'moody-lens-popover-host',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      inheritStyles: true,
      onMount: (container) => createPopoverHost(container),
      onRemove: (api) => api?.destroy(),
    });
    popoverUi.mount();
    const popover = popoverUi.mounted!;

    const controller = createController({
      adapter: redditAdapter,
      popover,
      send: sendMessage,
      getSettings: () => settings,
      // One tiny shadow-root host per post, top-right of the media.
      mountLens: async ({ anchor, postId, onActivate }) => {
        const restorePosition = ensurePositioned(anchor);
        const button = createLensButton({ postId, onActivate });
        const ui = await createShadowRootUi(ctx, {
          name: 'moody-lens-button-host',
          position: 'inline',
          anchor,
          append: 'last',
          inheritStyles: true,
          onMount: (container) => container.appendChild(button.element),
          onRemove: () => button.element.remove(),
        });
        ui.mount();
        return {
          button,
          remove: () => {
            ui.remove();
            restorePosition();
          },
        };
      },
    });
    controller.start();

    // Messages pushed to this page: context-menu results and the popup's status query.
    const onRuntimeMessage = (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (r: PageStatusResponse) => void) => {
      if (!isTabMessage(message)) return false;
      if (message.type === 'SHOW_RESULT') {
        controller.showExternal(message.payload);
        return false;
      }
      const { postsSeen, lensButtons } = controller.stats();
      sendResponse({ type: 'PAGE_STATUS', postsSeen, lensButtons });
      return false;
    };
    chrome.runtime.onMessage.addListener(onRuntimeMessage);

    // Extension update/disable: remove every piece of UI we added.
    ctx.onInvalidated(() => {
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      controller.stop();
      popoverUi.remove();
    });
  },
});
