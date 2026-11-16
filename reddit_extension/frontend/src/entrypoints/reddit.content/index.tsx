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
import { sendMessage, isTabMessage, type PageStatusResponse, type ScanVisibleResponse } from '../../core/messaging';
import { DEFAULT_SETTINGS, loadSettings, SETTINGS_KEY, type ExtensionSettings } from '../../core/settings';
import { redditAdapter } from '../../adapters/reddit';
import { createLensButton } from '../../ui/lens-button';
import { createPopoverHost, type PopoverApi } from '../../ui/popover-host';
import { createController } from '../../content/controller';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readComposer, sameDraft, watchComposer, type ComposerSnapshot } from '../../adapters/reddit/composer';
import { ComposerPanel } from '../../ui/ComposerPanel';
import '../../ui/styles.css';

const log = createLogger('content');

/** Media narrower than this gets the compact lens. */
const COMPACT_BELOW_PX = 120;

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
    let composer: ComposerSnapshot | null = null;
    let composerRoot: Root | null = null;
    let composerRevision = 0;
    let composerCurrent = () => false;
    const renderComposer = () => {
      if (!composer || !composerRoot) return;
      composerRoot.render(<ComposerPanel key={composerRevision + ':' + settings.apiUrl + ':' + settings.localOnly}
        snapshot={composer} isCurrent={composerCurrent} settings={settings} send={sendMessage} />);
    };
    const refreshSettings = () => void loadSettings().then((s) => { settings = s; renderComposer(); });
    const onSettingsChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area === 'sync' && changes[SETTINGS_KEY]) refreshSettings();
    };
    refreshSettings();
    chrome.storage.onChanged.addListener(onSettingsChanged);

    const composerUi = await createShadowRootUi(ctx, {
      name: 'moody-lens-composer-host',
      position: 'inline',
      anchor: () => composer?.root,
      append: 'before',
      inheritStyles: true,
      onMount: (container) => { composerRoot = createRoot(container); renderComposer(); },
      onRemove: () => { composerRoot?.unmount(); composerRoot = null; },
    });
    const stopComposer = watchComposer((next) => {
      const changedRoot = next?.root !== composer?.root;
      if (changedRoot) composerUi.remove();
      if (!sameDraft(composer, next)) {
        composerRevision++;
        const revision = composerRevision;
        composerCurrent = () => revision === composerRevision && sameDraft(next, readComposer());
      }
      composer = next;
      if (changedRoot && next) composerUi.mount();
      else renderComposer();
    });

    // The single shared popover lives in one shadow host on <body>.
    const popoverUi = await createShadowRootUi<PopoverApi>(ctx, {
      name: 'moody-lens-popover-host',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      inheritStyles: true,
      // 150 ms lets the closing fade play before the popover unmounts.
      onMount: (container) => createPopoverHost(container, { exitMs: 150 }),
      onRemove: (api) => api?.destroy(),
    });
    popoverUi.mount();
    const popover = popoverUi.mounted!;

    const controller = createController({
      adapter: redditAdapter,
      popover,
      send: sendMessage,
      getSettings: () => settings,
      mountShare: async (control, open) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'moody-lens-btn-secondary';
        button.textContent = 'Copy with context';
        button.addEventListener('click', () => open(button));
        const ui = await createShadowRootUi(ctx, {
          name: 'moody-lens-share-host',
          position: 'inline',
          anchor: control,
          append: 'after',
          inheritStyles: true,
          onMount: (container) => container.appendChild(button),
        });
        ui.mount();
        return () => ui.remove();
      },
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
        // Very small media gets a smaller lens so it stays inside the picture.
        if (anchor.getBoundingClientRect().width < COMPACT_BELOW_PX) ui.shadowHost.setAttribute('data-compact', '');
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
    const onRuntimeMessage = (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (r: PageStatusResponse | ScanVisibleResponse) => void,
    ) => {
      if (!isTabMessage(message)) return false;
      switch (message.type) {
        case 'SHOW_RESULT':
          controller.showExternal(message.payload);
          return false;
        case 'SCAN_VISIBLE':
          sendResponse({ type: 'SCAN_VISIBLE_RESULT', queued: controller.scanVisible() });
          return false;
        case 'SCAN_NEAREST':
          controller.scanNearest();
          return false;
        case 'GET_PAGE_STATUS': {
          const { postsSeen, lensButtons, visibleImages } = controller.stats();
          sendResponse({ type: 'PAGE_STATUS', postsSeen, lensButtons, visibleImages });
          return false;
        }
      }
    };
    chrome.runtime.onMessage.addListener(onRuntimeMessage);

    // Extension update/disable: remove every piece of UI we added.
    ctx.onInvalidated(() => {
      composerRevision++;
      stopComposer();
      composerUi.remove();
      chrome.storage.onChanged.removeListener(onSettingsChanged);
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      controller.stop();
      popoverUi.remove();
    });
  },
});
