/**
 * tests/unit/context-menu.test.ts – Image context menu uses the shared scan path and shows its result
 * in the page popover, or as a toolbar badge when no content script listens.
 * Label: RUNTIME (mocked scan handler, fake chrome).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const scan = vi.hoisted(() => ({ handleScanMedia: vi.fn() }));
vi.mock('../../src/background/handlers/scan-media', () => scan);

import { CONTEXT_MENU_ID, handleContextMenuClick } from '../../src/background/handlers/context-menu';
import { installFakeChrome, removeFakeChrome, type FakeChrome } from '../helpers/fake-chrome';
import type { DetectionJob } from '../../src/core/schema';

const job: DetectionJob = { job_id: 'j', status: 'completed', overall_score: 0.9, label: 'likely_fake', created_at: 'n', updated_at: 'n' };
let fake: FakeChrome;
beforeEach(() => {
  vi.resetAllMocks();
  fake = installFakeChrome();
  scan.handleScanMedia.mockResolvedValue({ type: 'JOB_STATUS', status: 'completed', result: job });
});
afterEach(removeFakeChrome);

const click = (srcUrl: string | undefined, tabId: number | undefined = 5) =>
  handleContextMenuClick({ menuItemId: CONTEXT_MENU_ID, srcUrl } as chrome.contextMenus.OnClickData, { id: tabId, url: 'https://www.reddit.com/r/x/' } as chrome.tabs.Tab);

describe('image context menu', () => {
  it('sends loading, then the result, to the page popover via the shared scan handler', async () => {
    await click('https://i.redd.it/a.jpg');
    expect(scan.handleScanMedia).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ mediaUrls: ['https://i.redd.it/a.jpg'], origin: 'context-menu', mediaType: 'image' }) }),
    );
    expect(fake.tabs.sendMessage.mock.calls.map((c) => c[1].payload.state)).toEqual(['loading', 'result']);
    expect(fake.action.setBadgeText).not.toHaveBeenCalled();
  });

  it('uses a stable post id so repeated clicks dedupe and cache', async () => {
    await click('https://i.redd.it/a.jpg');
    await click('https://i.redd.it/a.jpg');
    const ids = scan.handleScanMedia.mock.calls.map((c) => c[0].payload.postId);
    expect(ids[0]).toBe(ids[1]);
  });

  it('forwards errors (including consent) to the page', async () => {
    scan.handleScanMedia.mockResolvedValue({ type: 'ERROR', error: 'Needs permission', code: 'CONSENT_REQUIRED' });
    await click('https://i.redd.it/a.jpg');
    expect(fake.tabs.sendMessage.mock.calls.at(-1)![1].payload).toMatchObject({ state: 'error', code: 'CONSENT_REQUIRED' });
  });

  it('falls back to a toolbar badge when no content script receives the message', async () => {
    fake.tabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));
    await click('https://i.redd.it/a.jpg');
    expect(fake.action.setBadgeText).toHaveBeenCalledWith({ tabId: 5, text: 'FAKE' });
  });

  it('ignores other menu items, missing and non-allowlisted URLs', async () => {
    await handleContextMenuClick({ menuItemId: 'other', srcUrl: 'https://i.redd.it/a.jpg' } as chrome.contextMenus.OnClickData);
    await click(undefined);
    await click('https://evil.com/a.jpg');
    await click('http://i.redd.it/a.jpg');
    expect(scan.handleScanMedia).not.toHaveBeenCalled();
  });
});
