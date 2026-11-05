/**
 * entrypoints/options/App.tsx – Options page: backend, scanning, sensitivity, history, privacy.
 *
 * Extension pages talk to chrome.storage directly; no network happens here.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  normalizeApiUrl,
  parseSubreddits,
  saveSettings,
  validThresholds,
  type ExtensionSettings,
} from '../../core/settings';
import { getConsent, setConsent } from '../../core/consent';
import { clearCache } from '../../core/cache';
import { clearHistory } from '../../core/history';
import { LensIcon } from '../../ui/icons';

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

const Toggle: React.FC<{
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  hint: string;
}> = ({ checked, onChange, title, hint }) => (
  <label className="toggle">
    <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="toggle-track" aria-hidden="true" />
    <span className="toggle-text">
      <span>{title}</span>
      <small>{hint}</small>
    </span>
  </label>
);

/** Tokens that are not valid subreddit names, for inline validation. */
function invalidSubreddits(text: string): string[] {
  const valid = new Set(parseSubreddits(text));
  return text
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t && !valid.has(t.toLowerCase().replace(/^\/?r\//, '')));
}

export const App: React.FC = () => {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [subredditText, setSubredditText] = useState('');
  const [consent, setConsentState] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      setSaved(s);
      setSubredditText(s.autoScanSubreddits.join(', '));
    });
    void getConsent().then(setConsentState);
  }, []);

  const update = <K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]) => {
    setStatus(null);
    setSettings((s) => ({ ...s, [key]: value }));
  };

  const urlError = normalizeApiUrl(settings.apiUrl) ? null : 'Enter a valid http:// or https:// address.';
  const thresholdError = validThresholds(settings.realBelow, settings.fakeAbove)
    ? null
    : '"Likely authentic" must be lower than "Likely manipulated".';
  const badSubreddits = useMemo(() => invalidSubreddits(subredditText), [subredditText]);
  const subredditError = badSubreddits.length > 0 ? `Not a subreddit name: ${badSubreddits.join(', ')}` : null;
  const invalid = !!(urlError || thresholdError || subredditError);
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved) || parseSubreddits(subredditText).join() !== saved.autoScanSubreddits.join();

  const onSave = async () => {
    const apiUrl = normalizeApiUrl(settings.apiUrl);
    if (!apiUrl || invalid) return;
    // Must run inside this click handler: permission prompts need a user gesture.
    if (!(await ensureHostAccess(apiUrl))) {
      setStatus({ kind: 'error', text: 'Chrome needs permission to reach that backend address.' });
      return;
    }
    const next = await saveSettings({ ...settings, apiUrl, autoScanSubreddits: parseSubreddits(subredditText) });
    setSettings(next);
    setSaved(next);
    setSubredditText(next.autoScanSubreddits.join(', '));
    setStatus({ kind: 'ok', text: 'Settings saved.' });
  };

  const onConsent = async (accepted: boolean) => {
    await setConsent(accepted);
    setConsentState(accepted);
    setStatus({ kind: 'ok', text: accepted ? 'Consent saved.' : 'Consent withdrawn. Scans are paused.' });
  };

  const onClearHistory = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    await clearHistory();
    setConfirmClear(false);
    setStatus({ kind: 'ok', text: 'History cleared.' });
  };

  const real = Math.round(settings.realBelow * 100);
  const fake = Math.round(settings.fakeAbove * 100);

  return (
    <main className="page">
      <header className="page-header">
        <span className="logo" aria-hidden="true">
          <LensIcon size={20} />
        </span>
        <div>
          <h1>Moody Lens settings</h1>
          <p className="sub">Results are automated estimates, not proof.</p>
        </div>
      </header>

      {!consent && !settings.localOnly && (
        <div className="banner" role="region" aria-label="Consent">
          <p>
            <strong>Before your first scan:</strong> Moody Lens uploads the image or video of a post you scan to the
            backend below. Nothing is sent until you agree.
          </p>
          <button type="button" className="btn" onClick={() => void onConsent(true)}>
            I agree
          </button>
        </div>
      )}
      {settings.localOnly && (
        <div className="banner" role="region" aria-label="Local-only mode">
          <p>
            <strong>Local-only mode is on:</strong> nothing is uploaded, so no consent is needed. The lens only checks
            the file&apos;s own metadata.
          </p>
        </div>
      )}

      <section className="card" aria-labelledby="h-backend">
        <header>
          <h2 id="h-backend">Backend</h2>
          <p className="sub">Which server analyses the media you scan.</p>
        </header>
        <div className="field">
          <label htmlFor="api-url">Backend API URL</label>
          <input
            id="api-url"
            type="url"
            value={settings.apiUrl}
            onChange={(e) => update('apiUrl', e.target.value)}
            spellCheck={false}
            aria-invalid={!!urlError}
            aria-describedby={urlError ? 'api-url-error' : undefined}
          />
          {urlError && (
            <span id="api-url-error" className="field-error">
              {urlError}
            </span>
          )}
        </div>
        <Toggle
          checked={settings.localOnly}
          onChange={(v) => update('localOnly', v)}
          title="Local-only mode"
          hint="Never upload anything. The lens only reports metadata hints found in the file itself."
        />
        <Toggle
          checked={settings.enableUrlDetect}
          onChange={(v) => update('enableUrlDetect', v)}
          title="Server fallback for videos"
          hint="If the browser cannot fetch a video, let the backend download the Reddit post itself. Off by default."
        />
      </section>

      <section className="card" aria-labelledby="h-scan">
        <header>
          <h2 id="h-scan">Scanning</h2>
          <p className="sub">When Moody Lens looks at a post without you clicking.</p>
        </header>
        <Toggle
          checked={settings.enableAutoScan}
          onChange={(v) => update('enableAutoScan', v)}
          title="Auto-scan visible images"
          hint="Off by default. Images only, never video, and limited to a few per minute."
        />
        <div className="field">
          <label htmlFor="subs">Only auto-scan these subreddits</label>
          <input
            id="subs"
            type="text"
            value={subredditText}
            placeholder="e.g. pics, aww (empty means all)"
            onChange={(e) => {
              setStatus(null);
              setSubredditText(e.target.value);
            }}
            spellCheck={false}
            aria-invalid={!!subredditError}
          />
          {subredditError && <span className="field-error">{subredditError}</span>}
        </div>
        <Toggle
          checked={settings.blurManipulated}
          onChange={(v) => update('blurManipulated', v)}
          title="Blur likely manipulated media until clicked"
          hint="Off by default. Click the lens to reveal. Never applied to demo data."
        />
      </section>

      <section className="card" aria-labelledby="h-sens">
        <header>
          <h2 id="h-sens">Sensitivity</h2>
          <p className="sub">Where a score becomes a label. Labels are computed in your browser.</p>
        </header>
        <div className="field">
          <label htmlFor="real-below">Likely authentic at or below {real}%</label>
          <input
            id="real-below"
            type="range"
            min={0}
            max={100}
            value={real}
            onChange={(e) => update('realBelow', Number(e.target.value) / 100)}
          />
        </div>
        <div className="field">
          <label htmlFor="fake-above">Likely manipulated at or above {fake}%</label>
          <input
            id="fake-above"
            type="range"
            min={0}
            max={100}
            value={fake}
            onChange={(e) => update('fakeAbove', Number(e.target.value) / 100)}
          />
        </div>
        {thresholdError ? (
          <span className="field-error" role="alert">
            {thresholdError}
          </span>
        ) : (
          <>
            <div className="threshold-preview" aria-hidden="true">
              <span style={{ flex: real || 0.01 }} />
              <span style={{ flex: Math.max(fake - real, 0.01) }} />
              <span style={{ flex: 100 - fake || 0.01 }} />
            </div>
            <p className="sub">Anything in between is shown as inconclusive. Defaults are 30% and 70%.</p>
          </>
        )}
      </section>

      <section className="card" aria-labelledby="h-history">
        <header>
          <h2 id="h-history">History</h2>
          <p className="sub">Post id, link, score, label and time. Stored only in this browser, never titles or media addresses.</p>
        </header>
        <Toggle
          checked={settings.saveHistory}
          onChange={(v) => update('saveHistory', v)}
          title="Keep a local scan history"
          hint="On by default. Turning it off keeps existing entries until you clear them."
        />
        <div className="actions">
          <a className="btn secondary" href="scan-history.html" target="_blank" rel="noopener">
            Open history
          </a>
          <button type="button" className={`btn ${confirmClear ? 'danger' : 'secondary'}`} onClick={() => void onClearHistory()}>
            {confirmClear ? 'Click again to clear' : 'Clear history'}
          </button>
        </div>
      </section>

      <section className="card" aria-labelledby="h-privacy">
        <header>
          <h2 id="h-privacy">Privacy and troubleshooting</h2>
        </header>
        <div className="row">
          <p className="sub">
            {consent ? 'You agreed to upload scanned media to your backend.' : 'Not agreed yet: uploads are blocked.'}
          </p>
          {consent && (
            <button type="button" className="btn secondary" onClick={() => void onConsent(false)}>
              Withdraw consent
            </button>
          )}
        </div>
        <Toggle
          checked={settings.debug}
          onChange={(v) => update('debug', v)}
          title="Debug"
          hint="Logs post details and media addresses to the console, and what each click extracts."
        />
        <div className="actions">
          <button
            type="button"
            className="btn secondary"
            onClick={() => void clearCache().then(() => setStatus({ kind: 'ok', text: 'Cache cleared.' }))}
          >
            Clear cache
          </button>
        </div>
      </section>

      <div className="save-bar">
        <div className="save-bar-inner">
          <button type="button" className="btn" disabled={invalid || !dirty} onClick={() => void onSave()}>
            Save
          </button>
          {status && (
            <span role="status" className={status.kind === 'ok' ? 'ok' : 'bad'}>
              {status.text}
            </span>
          )}
          {!status && dirty && <span className="sub">Unsaved changes</span>}
        </div>
      </div>
    </main>
  );
};
