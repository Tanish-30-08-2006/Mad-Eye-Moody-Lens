/**
 * entrypoints/reddit.content/index.tsx – Content Script for Reddit pages.
 *
 * Matches www.reddit.com and sh.reddit.com only.
 * Logs once on startup, verifies service worker communication via PING,
 * and prepares shadow root UI injection for the Moody Lens button and shared popover.
 *
 * All network requests are routed to the service worker via messaging.ts.
 */

import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import ReactDOM from 'react-dom/client';
import React from 'react';
import { createLogger } from '../../core/logger';
import { sendMessage } from '../../core/messaging';
import { VerdictPopover } from '../../ui/VerdictPopover';
import { createLensButton } from '../../ui/lens-button';
import { redditAdapter } from '../../adapters/reddit';
import { PROCESSED_MARKER } from '../../adapters/reddit/selectors';
import '../../ui/styles.css';

const log = createLogger('content');

export default defineContentScript({
  matches: ['*://www.reddit.com/*', '*://sh.reddit.com/*'],
  cssInjectionMode: 'ui',

  async main(ctx: ContentScriptContext) {
    // Log once on injection
    log.info('Moody Lens content script loaded on Reddit.');

    // Verify service worker communication with typed ping
    try {
      const pingResponse = await sendMessage({ type: 'PING' });
      log.info('Service worker ping successful:', pingResponse);
    } catch (err) {
      log.warn('Could not ping service worker on startup:', err);
    }

    // Set up single shared popover host container
    let popoverRoot: ReactDOM.Root | null = null;

    const popoverUi = await createShadowRootUi(ctx, {
      name: 'moody-lens-popover-host',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      onMount: (container: HTMLElement) => {
        const mountPoint = document.createElement('div');
        container.appendChild(mountPoint);
        popoverRoot = ReactDOM.createRoot(mountPoint);

        // Render initial hidden popover
        popoverRoot.render(
          <VerdictPopover
            isOpen={false}
            isLoading={false}
            onClose={() => {
              popoverRoot?.render(
                <VerdictPopover
                  isOpen={false}
                  isLoading={false}
                  onClose={() => {}}
                />,
              );
            }}
          />,
        );
      },
      onRemove: () => {
        popoverRoot?.unmount();
        popoverRoot = null;
      },
    });

    popoverUi.mount();

    // Helper to inject button into a single post element
    const injectPostButton = (post: HTMLElement) => {
      if (post.hasAttribute(PROCESSED_MARKER)) return;
      post.setAttribute(PROCESSED_MARKER, 'true');

      const mountPoint = redditAdapter.getMountPoint(post);
      if (!mountPoint) return;

      const host = document.createElement('div');
      host.className = 'moody-lens-button-host';
      const shadow = host.attachShadow({ mode: 'open' });

      const button = createLensButton({
        postId: mountPoint.postId,
        onClick: async (_e) => {
          log.info(`Moody Lens clicked for post: ${mountPoint.postId}`);

          // Extract media metadata
          const mediaRef = redditAdapter.extractMedia(post);
          log.debug('Extracted media:', mediaRef);

          // Show popover in loading state (stub)
          if (popoverRoot) {
            popoverRoot.render(
              <VerdictPopover
                isOpen={true}
                isLoading={true}
                onClose={() => {
                  popoverRoot?.render(
                    <VerdictPopover
                      isOpen={false}
                      isLoading={false}
                      onClose={() => {}}
                    />,
                  );
                }}
              />,
            );
          }

          // Phase 3 Dev Pipeline Test (clearly gated via DEV_PIPELINE_TEST flag)
          const DEV_PIPELINE_TEST = true;
          if (DEV_PIPELINE_TEST) {
            try {
              const testUrls = mediaRef?.urls.length ? mediaRef.urls : ['https://i.redd.it/dev_test_image.png'];
              const scanResponse = await sendMessage({
                type: 'SCAN_MEDIA',
                payload: {
                  mediaUrls: testUrls,
                  postId: mountPoint.postId,
                  permalink: window.location.href,
                  mediaType: 'image',
                },
              });
              log.info('Phase 3 Dev Pipeline Verdict Received:', scanResponse);

              if (popoverRoot && scanResponse.type === 'JOB_STATUS' && scanResponse.result) {
                popoverRoot.render(
                  <VerdictPopover
                    isOpen={true}
                    isLoading={false}
                    job={scanResponse.result}
                    onClose={() => {
                      popoverRoot?.render(
                        <VerdictPopover
                          isOpen={false}
                          isLoading={false}
                          onClose={() => {}}
                        />,
                      );
                    }}
                  />,
                );
              }
            } catch (scanErr) {
              log.error('Dev pipeline scan failed:', scanErr);
            }
          }
        },
      });

      shadow.appendChild(button);
      mountPoint.anchorElement.appendChild(host);
    };

    // Initial scan for existing posts
    const initialPosts = redditAdapter.findPosts();
    log.debug(`Found ${initialPosts.length} posts on initial scan`);
    for (const post of initialPosts) {
      injectPostButton(post);
    }

    // Observe feed for dynamic scroll posts (Phase 4 wiring)
    redditAdapter.observe((newPosts) => {
      for (const post of newPosts) {
        injectPostButton(post);
      }
    });

    // Cleanup when content script context unmounts
    ctx.onInvalidated(() => {
      log.info('Content script invalidated. Disconnecting adapter.');
      redditAdapter.disconnect();
      popoverUi.remove();
    });
  },
});
