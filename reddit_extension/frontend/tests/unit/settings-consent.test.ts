/**
 * tests/unit/settings-consent.test.ts – Settings validation/persistence and the consent store.
 * Label: RUNTIME (fake chrome.storage).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, normalizeApiUrl, saveSettings } from '../../src/core/settings';
import { getConsent, setConsent } from '../../src/core/consent';
import { installFakeChrome, removeFakeChrome, type FakeChrome } from '../helpers/fake-chrome';

let fake: FakeChrome;
beforeEach(() => {
  fake = installFakeChrome();
});
afterEach(removeFakeChrome);

describe('normalizeApiUrl', () => {
  it('accepts http(s) URLs and strips trailing slashes', () => {
    expect(normalizeApiUrl('http://localhost:8000/')).toBe('http://localhost:8000');
    expect(normalizeApiUrl('  https://api.example.com/base//  ')).toBe('https://api.example.com/base');
  });
  it.each(['ftp://x.com', 'javascript:alert(1)', 'file:///etc/passwd', 'chrome://extensions', 'localhost:8000', '', 'not a url', 'https://u:p@x.com', 'https://x.com/?q=1'])(
    'rejects %s',
    (bad) => expect(normalizeApiUrl(bad)).toBeNull(),
  );
});

describe('settings', () => {
  it('defaults: auto-scan OFF, server fallback OFF, debug OFF', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({ enableAutoScan: false, enableUrlDetect: false, debug: false });
  });

  it('round-trips valid values', async () => {
    await saveSettings({ apiUrl: 'https://api.example.com', enableAutoScan: true, debug: true });
    expect(await loadSettings()).toMatchObject({ apiUrl: 'https://api.example.com', enableAutoScan: true, debug: true, enableUrlDetect: false });
  });

  it('refuses to persist an invalid backend URL', async () => {
    const saved = await saveSettings({ apiUrl: 'javascript:alert(1)' });
    expect(saved.apiUrl).toBe(DEFAULT_SETTINGS.apiUrl);
  });

  it('ignores unknown or wrongly-typed stored keys', async () => {
    fake.storage.sync.data.set(SETTINGS_KEY, { apiUrl: 42, enableAutoScan: 'yes', logLevel: 'debug', extra: 1 });
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('consent', () => {
  it('is false until accepted, then persists, then can be withdrawn', async () => {
    expect(await getConsent()).toBe(false);
    await setConsent(true);
    expect(await getConsent()).toBe(true);
    await setConsent(false);
    expect(await getConsent()).toBe(false);
  });
  it('lives in local storage, not synced storage', async () => {
    await setConsent(true);
    expect(fake.storage.local.data.size).toBe(1);
    expect(fake.storage.sync.data.size).toBe(0);
  });
});
