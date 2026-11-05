/**
 * entrypoints/options/App.tsx – Options page: backend URL, auto-scan, server fallback, Debug, cache, consent.
 *
 * Extension pages talk to chrome.storage directly; no network happens here.
 */

import React, { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, loadSettings, normalizeApiUrl, saveSettings, type ExtensionSettings } from '../../core/settings';
import { getConsent, setConsent } from '../../core/consent';
import { clearCache } from '../../core/cache';

type Status = { kind: 'ok' | 'error'; text: string } | null;

/** Asks Chrome for access to a custom backend origin (needed for anything but the default localhost). */
async function ensureHostAccess(apiUrl: string): Promise<boolean> {
  const pattern = `${new URL(apiUrl).origin}/*`;
  try {
    if (await chrome.permissions.contains({ origins: [pattern] })) return true;
    return await chrome.permissions.request({ origins: [pattern] });
  } catch {
    return false;
  }
}

export const App: React.FC = () => {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [consent, setConsentState] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
    void getConsent().then(setConsentState);
  }, []);

  const update = <K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const onSave = async () => {
    const apiUrl = normalizeApiUrl(settings.apiUrl);
    if (!apiUrl) {
      setStatus({ kind: 'error', text: 'Backend URL must be a valid http:// or https:// address.' });
      return;
    }
    // Must run inside this click handler: permission prompts need a user gesture.
    if (!(await ensureHostAccess(apiUrl))) {
      setStatus({ kind: 'error', text: 'Chrome needs permission to reach that backend address.' });
      return;
    }
    const saved = await saveSettings({ ...settings, apiUrl });
    setSettings(saved);
    setStatus({ kind: 'ok', text: 'Settings saved.' });
  };

  const onClearCache = async () => {
    await clearCache();
    setStatus({ kind: 'ok', text: 'Cache cleared.' });
  };

  const onConsent = async (accepted: boolean) => {
    await setConsent(accepted);
    setConsentState(accepted);
    setStatus({ kind: 'ok', text: accepted ? 'Consent saved.' : 'Consent withdrawn. Scans are paused.' });
  };

  return (
    <main className="page">
      <h1>Moody Lens settings</h1>
      <p className="sub">Choose which backend analyses the media you scan.</p>

      {!consent && (
        <div className="banner" role="region" aria-label="Consent">
          <p>
            <strong>Before your first scan:</strong> Moody Lens uploads the image or video of a post you scan to the
            backend below. Nothing is sent until you agree.
          </p>
          <button type="button" onClick={() => void onConsent(true)}>
            I agree
          </button>
        </div>
      )}

      <section className="card">
        <label className="field" htmlFor="api-url">
          <span>Backend API URL</span>
        </label>
        <input
          id="api-url"
          type="url"
          value={settings.apiUrl}
          onChange={(e) => update('apiUrl', e.target.value)}
          spellCheck={false}
        />

        <label className="check">
          <input type="checkbox" checked={settings.enableAutoScan} onChange={(e) => update('enableAutoScan', e.target.checked)} />
          <span>
            Auto-scan visible images
            <small>Off by default. Images only, never video, and limited to a few per minute.</small>
          </span>
        </label>

        <label className="check">
          <input type="checkbox" checked={settings.enableUrlDetect} onChange={(e) => update('enableUrlDetect', e.target.checked)} />
          <span>
            Server fallback for videos
            <small>If the browser cannot fetch a video, let the backend download the Reddit post itself. Off by default.</small>
          </span>
        </label>

        <label className="check">
          <input type="checkbox" checked={settings.debug} onChange={(e) => update('debug', e.target.checked)} />
          <span>
            Debug
            <small>Logs post details and media addresses to the console, and what each click extracts.</small>
          </span>
        </label>

        <div className="actions">
          <button type="button" onClick={() => void onSave()}>
            Save
          </button>
          <button type="button" className="secondary" onClick={() => void onClearCache()}>
            Clear cache
          </button>
          {status && (
            <span role="status" className={status.kind === 'ok' ? 'ok' : 'bad'}>
              {status.text}
            </span>
          )}
        </div>
      </section>

      <section className="card">
        <div className="row">
          <div>
            <h2>Consent</h2>
            <p className="sub">{consent ? 'You agreed to upload scanned media to your backend.' : 'Not agreed yet: scans are blocked.'}</p>
          </div>
          {consent && (
            <button type="button" className="secondary" onClick={() => void onConsent(false)}>
              Withdraw
            </button>
          )}
        </div>
      </section>
    </main>
  );
};
