// @vitest-environment happy-dom
/**
 * tests/unit/pages.test.tsx – Options and popup pages. Label: RUNTIME (React + happy-dom + fake chrome).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { App as Options } from '../../src/entrypoints/options/App';
import { App as Popup } from '../../src/entrypoints/popup/App';
import { loadSettings } from '../../src/core/settings';
import { getConsent } from '../../src/core/consent';
import { installFakeChrome, removeFakeChrome, type FakeChrome } from '../helpers/fake-chrome';
import { act, render, type Rendered } from '../helpers/react';

let fake: FakeChrome;
let page: Rendered | null = null;
beforeEach(() => {
  fake = installFakeChrome();
});
afterEach(() => {
  page?.unmount();
  page = null;
  removeFakeChrome();
});

const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const byText = (root: HTMLElement, text: string) => Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;
const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('Options page', () => {
  it('shows the consent banner until accepted, and Accept persists it', async () => {
    page = await render(<Options />);
    await settle();
    expect(page.container.querySelector('[aria-label="Consent"]')).not.toBeNull();
    await act(async () => byText(page!.container, 'I agree').click());
    await settle();
    expect(await getConsent()).toBe(true);
    expect(page.container.querySelector('[aria-label="Consent"]')).toBeNull();
  });

  it('defaults auto-scan, server fallback and debug to unchecked', async () => {
    page = await render(<Options />);
    await settle();
    const boxes = Array.from(page.container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(boxes).toHaveLength(6);
    // Only the local history switch is on by default.
    const on = boxes.filter((b) => b.checked);
    expect(on).toHaveLength(1);
    expect(on[0]!.closest('label')?.textContent).toContain('local scan history');
  });

  it('rejects an invalid backend URL without saving', async () => {
    page = await render(<Options />);
    await settle();
    await type(page.container.querySelector('#api-url')!, 'ftp://nope');
    await settle();
    expect(page.container.querySelector('#api-url-error')?.textContent).toMatch(/valid http/);
    expect(byText(page.container, 'Save').disabled).toBe(true);
    expect((await loadSettings()).apiUrl).toBe('http://localhost:8000');
    expect(fake.permissions.request).not.toHaveBeenCalled();
  });

  it('saves valid settings and asks Chrome for the backend origin when needed', async () => {
    fake.permissions.contains.mockResolvedValue(false);
    page = await render(<Options />);
    await settle();
    await type(page.container.querySelector('#api-url')!, 'https://api.example.com/');
    const boxes = Array.from(page.container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    const auto = boxes[2];
    const debug = boxes[5];
    await act(async () => auto!.click());
    await act(async () => debug!.click());
    await act(async () => byText(page!.container, 'Save').click());
    await settle();
    expect(fake.permissions.request).toHaveBeenCalledWith({ origins: ['https://api.example.com/*'] });
    expect(await loadSettings()).toMatchObject({ apiUrl: 'https://api.example.com', enableAutoScan: true, debug: true });
  });

  it('does not save when Chrome denies the permission', async () => {
    fake.permissions.contains.mockResolvedValue(false);
    fake.permissions.request.mockResolvedValue(false);
    page = await render(<Options />);
    await settle();
    await type(page.container.querySelector('#api-url')!, 'https://api.example.com');
    await act(async () => byText(page!.container, 'Save').click());
    await settle();
    expect((await loadSettings()).apiUrl).toBe('http://localhost:8000');
  });

  it('Clear cache removes only Moody Lens cache entries', async () => {
    fake.storage.local.data.set('moody_cache:t3_a:1', { x: 1 });
    fake.storage.local.data.set('moody_consent', { accepted: true, at: 1 });
    page = await render(<Options />);
    await settle();
    await act(async () => byText(page!.container, 'Clear cache').click());
    await settle();
    expect(fake.storage.local.data.has('moody_cache:t3_a:1')).toBe(false);
    expect(fake.storage.local.data.has('moody_consent')).toBe(true);
  });
});

describe('Popup', () => {
  const health = (over: object) => ({ type: 'HEALTH', health: { status: 'ok', version: '1', models_available: [], ...over } });

  beforeEach(() => {
    // sendMessage() in core/messaging wraps chrome.runtime.sendMessage with a callback.
    fake.runtime.sendMessage.mockImplementation((_m: unknown, cb: (r: unknown) => void) => cb(health({})));
  });

  it('shows connected backend, no demo badge, and consent state', async () => {
    fake.storage.local.data.set('moody_consent', { accepted: true, at: 1 });
    page = await render(<Popup />);
    await settle();
    expect(page.container.textContent).toContain('Connected');
    expect(page.container.textContent).not.toContain('DEMO DATA');
    expect(page.container.textContent).toContain('Agreed');
  });

  it('flags a mock backend with the DEMO DATA badge', async () => {
    fake.runtime.sendMessage.mockImplementation((_m: unknown, cb: (r: unknown) => void) => cb(health({ mock: true })));
    page = await render(<Popup />);
    await settle();
    expect(page.container.textContent).toContain('DEMO DATA');
  });

  it('shows Unreachable with a friendly message when health fails', async () => {
    fake.runtime.sendMessage.mockImplementation((_m: unknown, cb: (r: unknown) => void) =>
      cb({ type: 'ERROR', error: "Can't reach the Moody Lens backend.", code: 'NETWORK_ERROR' }),
    );
    page = await render(<Popup />);
    await settle();
    expect(page.container.textContent).toContain('Unreachable');
    expect(page.container.textContent).toContain("Can't reach");
  });

  it('offers consent when not agreed', async () => {
    page = await render(<Popup />);
    await settle();
    expect(page.container.textContent).toContain('Not agreed');
    await act(async () => byText(page!.container, 'I agree').click());
    await settle();
    expect(await getConsent()).toBe(true);
  });

  it('reports post-detection status from the active Reddit tab', async () => {
    fake.tabs.query.mockResolvedValue([{ id: 7, url: 'https://www.reddit.com/r/test/' }]);
    fake.tabs.sendMessage.mockResolvedValue({ type: 'PAGE_STATUS', postsSeen: 12, lensButtons: 5 });
    page = await render(<Popup />);
    await settle();
    expect(fake.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'GET_PAGE_STATUS' });
    expect(page.container.textContent).toContain('12 posts checked, 5 with a lens button');
  });

  it('tells the user when the tab is not Reddit or has no content script', async () => {
    fake.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com/' }]);
    page = await render(<Popup />);
    await settle();
    expect(page.container.textContent).toContain('Open a Reddit feed');
    page.unmount();

    fake.tabs.query.mockResolvedValue([{ id: 2, url: 'https://www.reddit.com/' }]);
    fake.tabs.sendMessage.mockRejectedValue(new Error('no receiver'));
    page = await render(<Popup />);
    await settle();
    expect(page.container.textContent).toContain('not running on this tab');
  });

  it('opens the options page', async () => {
    page = await render(<Popup />);
    await settle();
    await act(async () => byText(page!.container, 'Options').click());
    expect(fake.runtime.openOptionsPage).toHaveBeenCalled();
    vi.clearAllMocks();
  });
});
