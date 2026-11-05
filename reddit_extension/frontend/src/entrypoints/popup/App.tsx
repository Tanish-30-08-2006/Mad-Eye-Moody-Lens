/**
 * entrypoints/popup/App.tsx – Toolbar popup: backend health (with demo-mode flag), consent, and what the page shows.
 */

import React, { useEffect, useState } from 'react';
import { sendMessage, type PageStatusResponse } from '../../core/messaging';
import { DEFAULT_SETTINGS, loadSettings } from '../../core/settings';
import { getConsent, setConsent } from '../../core/consent';

type Backend =
  | { kind: 'checking' }
  | { kind: 'ok' | 'degraded' | 'down'; mock: boolean }
  | { kind: 'error'; message: string };

type PageState =
  | { kind: 'checking' }
  | { kind: 'not-reddit' }
  | { kind: 'no-script' }
  | { kind: 'ok'; postsSeen: number; lensButtons: number };

const BACKEND_TEXT = { ok: 'Connected', degraded: 'Degraded', down: 'Down' } as const;

export const App: React.FC = () => {
  const [apiUrl, setApiUrl] = useState(DEFAULT_SETTINGS.apiUrl);
  const [backend, setBackend] = useState<Backend>({ kind: 'checking' });
  const [consent, setConsentState] = useState<boolean | null>(null);
  const [page, setPage] = useState<PageState>({ kind: 'checking' });

  useEffect(() => {
    void loadSettings().then((s) => setApiUrl(s.apiUrl));
    void getConsent().then(setConsentState);

    sendMessage({ type: 'CHECK_HEALTH' }, 8000)
      .then((res) => {
        if (res.type === 'HEALTH') setBackend({ kind: res.health.status, mock: res.health.mock === true });
        else setBackend({ kind: 'error', message: res.type === 'ERROR' ? res.error : 'Unexpected response.' });
      })
      .catch(() => setBackend({ kind: 'error', message: 'The extension background is not responding.' }));

    // Ask the active tab's content script what it found.
    void (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !/^https:\/\/(www|sh)\.reddit\.com\//.test(tab.url ?? '')) {
          setPage({ kind: 'not-reddit' });
          return;
        }
        const res = (await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_STATUS' })) as PageStatusResponse | undefined;
        setPage(res?.type === 'PAGE_STATUS' ? { kind: 'ok', postsSeen: res.postsSeen, lensButtons: res.lensButtons } : { kind: 'no-script' });
      } catch {
        setPage({ kind: 'no-script' });
      }
    })();
  }, []);

  const toggleConsent = async (accepted: boolean) => {
    await setConsent(accepted);
    setConsentState(accepted);
  };

  return (
    <div className="page">
      <h1>Moody Lens</h1>

      <section className="card" aria-label="Backend">
        <div className="row">
          <span>Backend</span>
          {backend.kind === 'checking' && <strong>Checking...</strong>}
          {backend.kind === 'error' && <strong className="bad">Unreachable</strong>}
          {(backend.kind === 'ok' || backend.kind === 'degraded' || backend.kind === 'down') && (
            <strong className={backend.kind === 'ok' ? 'ok' : backend.kind === 'degraded' ? 'warn' : 'bad'}>
              {BACKEND_TEXT[backend.kind]}
            </strong>
          )}
        </div>
        <p className="sub">{apiUrl}</p>
        {backend.kind === 'error' && <p className="sub bad">{backend.message}</p>}
        {(backend.kind === 'ok' || backend.kind === 'degraded') && backend.mock && (
          <p className="sub">
            <span className="badge">DEMO DATA</span> This backend answers with demo verdicts, not real analysis.
          </p>
        )}
      </section>

      <section className="card" aria-label="Consent">
        <div className="row">
          <span>Upload consent</span>
          {consent === null ? (
            <strong>...</strong>
          ) : consent ? (
            <strong className="ok">Agreed</strong>
          ) : (
            <strong className="warn">Not agreed</strong>
          )}
        </div>
        <p className="sub">Scanned media is sent to the backend above.</p>
        {consent === false && (
          <div className="actions">
            <button type="button" onClick={() => void toggleConsent(true)}>
              I agree
            </button>
          </div>
        )}
      </section>

      <section className="card" aria-label="This page">
        <div className="row">
          <span>This page</span>
        </div>
        {page.kind === 'checking' && <p className="sub">Checking...</p>}
        {page.kind === 'not-reddit' && <p className="sub">Open a Reddit feed or post to scan.</p>}
        {page.kind === 'no-script' && <p className="sub warn">Moody Lens is not running on this tab. Reload the page.</p>}
        {page.kind === 'ok' && (
          <p className="sub">
            {page.postsSeen} post{page.postsSeen === 1 ? '' : 's'} checked, {page.lensButtons} with a lens button.
          </p>
        )}
      </section>

      <div className="actions">
        <button type="button" className="secondary" onClick={() => chrome.runtime.openOptionsPage()}>
          Options
        </button>
        <span className="sub">v{chrome.runtime.getManifest().version}</span>
      </div>
    </div>
  );
};
