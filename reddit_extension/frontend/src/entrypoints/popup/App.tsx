/**
 * entrypoints/popup/App.tsx – Toolbar popup: backend + brain status, consent, "Scan visible images" and page stats.
 */

import React, { useEffect, useState } from 'react';
import { sendMessage, type PageStatusResponse, type ScanVisibleResponse } from '../../core/messaging';
import type { BrainStatus } from '../../core/schema';
import { DEFAULT_SETTINGS, loadSettings } from '../../core/settings';
import { getConsent, setConsent } from '../../core/consent';
import { HistoryIcon, LensIcon, SettingsIcon } from '../../ui/icons';

type Backend =
  | { kind: 'checking' }
  | { kind: 'ok' | 'degraded' | 'down'; mock: boolean }
  | { kind: 'error'; message: string };

type PageState =
  | { kind: 'checking' }
  | { kind: 'not-reddit' }
  | { kind: 'no-script' }
  | { kind: 'ok'; tabId: number; postsSeen: number; lensButtons: number; visibleImages: number };

const BACKEND_TEXT = { ok: 'Connected', degraded: 'Degraded', down: 'Down' } as const;
const DOT_CLASS = { ok: 'ok', degraded: 'warn', down: 'bad' } as const;

export const App: React.FC = () => {
  const [apiUrl, setApiUrl] = useState(DEFAULT_SETTINGS.apiUrl);
  const [localOnly, setLocalOnly] = useState(false);
  const [backend, setBackend] = useState<Backend>({ kind: 'checking' });
  const [brain, setBrain] = useState<BrainStatus | null | undefined>(undefined);
  const [consent, setConsentState] = useState<boolean | null>(null);
  const [page, setPage] = useState<PageState>({ kind: 'checking' });
  const [scanNote, setScanNote] = useState('');

  useEffect(() => {
    void loadSettings().then((s) => {
      setApiUrl(s.apiUrl);
      setLocalOnly(s.localOnly);
    });
    void getConsent().then(setConsentState);

    sendMessage({ type: 'CHECK_HEALTH' }, 8000)
      .then((res) => {
        if (res.type === 'HEALTH') setBackend({ kind: res.health.status, mock: res.health.mock === true });
        else setBackend({ kind: 'error', message: res.type === 'ERROR' ? res.error : 'Unexpected response.' });
      })
      .catch(() => setBackend({ kind: 'error', message: 'The extension background is not responding.' }));

    sendMessage({ type: 'GET_BRAIN_STATUS' }, 8000)
      .then((res) => setBrain(res.type === 'BRAIN_STATUS' ? res.brain : null))
      .catch(() => setBrain(null));

    // Ask the active tab's content script what it found.
    void (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !/^https:\/\/(www|sh)\.reddit\.com\//.test(tab.url ?? '')) {
          setPage({ kind: 'not-reddit' });
          return;
        }
        const res = (await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_STATUS' })) as PageStatusResponse | undefined;
        setPage(
          res?.type === 'PAGE_STATUS'
            ? { kind: 'ok', tabId: tab.id, postsSeen: res.postsSeen, lensButtons: res.lensButtons, visibleImages: res.visibleImages ?? 0 }
            : { kind: 'no-script' },
        );
      } catch {
        setPage({ kind: 'no-script' });
      }
    })();
  }, []);

  const toggleConsent = async (accepted: boolean) => {
    await setConsent(accepted);
    setConsentState(accepted);
  };

  const scanVisible = async () => {
    if (page.kind !== 'ok') return;
    try {
      const res = (await chrome.tabs.sendMessage(page.tabId, { type: 'SCAN_VISIBLE' })) as ScanVisibleResponse | undefined;
      const n = res?.queued ?? 0;
      setScanNote(n === 0 ? 'No unscanned images on screen.' : `Queued ${n} image${n === 1 ? '' : 's'}. Results appear on the lenses.`);
    } catch {
      setScanNote('Could not reach the page. Reload it and try again.');
    }
  };

  const canScan = page.kind === 'ok' && (consent === true || localOnly);

  return (
    <div className="page">
      <header className="page-header">
        <span className="logo" aria-hidden="true">
          <LensIcon size={16} />
        </span>
        <h1>Moody Lens</h1>
      </header>

      <section className="card" aria-label="Backend">
        <div className="row">
          <span>Backend</span>
          {backend.kind === 'checking' && <strong>Checking...</strong>}
          {backend.kind === 'error' && (
            <strong className="bad">
              <span className="status-dot bad" />
              Unreachable
            </strong>
          )}
          {(backend.kind === 'ok' || backend.kind === 'degraded' || backend.kind === 'down') && (
            <strong className={DOT_CLASS[backend.kind]}>
              <span className={`status-dot ${DOT_CLASS[backend.kind]}`} />
              {BACKEND_TEXT[backend.kind]}
            </strong>
          )}
        </div>
        <p className="sub">{apiUrl}</p>
        {backend.kind === 'error' && <p className="sub bad">{backend.message}</p>}
        <div className="row">
          <span>
            Brain: <strong>{brain === undefined ? '...' : brain === null ? 'unavailable' : brain.name}</strong>
          </span>
          {brain && (brain.is_mock ? <span className="badge">MOCK</span> : <span className="badge real">REAL</span>)}
        </div>
        {((brain && brain.is_mock) || ((backend.kind === 'ok' || backend.kind === 'degraded') && backend.mock)) && (
          <p className="sub">
            <span className="badge">DEMO DATA</span> Verdicts from this backend are demos, not real analysis.
          </p>
        )}
      </section>

      <section className="card" aria-label="Consent">
        <div className="row">
          <span>{localOnly ? 'Mode' : 'Upload consent'}</span>
          {localOnly ? (
            <strong className="ok">Local only</strong>
          ) : consent === null ? (
            <strong>...</strong>
          ) : consent ? (
            <strong className="ok">Agreed</strong>
          ) : (
            <strong className="warn">Not agreed</strong>
          )}
        </div>
        <p className="sub">{localOnly ? 'Nothing is uploaded; only file metadata is checked.' : 'Scanned media is sent to the backend above.'}</p>
        {!localOnly && consent === false && (
          <div className="actions">
            <button type="button" className="btn" onClick={() => void toggleConsent(true)}>
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
            {page.postsSeen} post{page.postsSeen === 1 ? '' : 's'} checked, {page.lensButtons} with a lens button,{' '}
            {page.visibleImages} unscanned image{page.visibleImages === 1 ? '' : 's'} on screen.
          </p>
        )}
        <button type="button" className="btn block" disabled={!canScan} onClick={() => void scanVisible()}>
          Scan visible images
        </button>
        {scanNote && (
          <p className="sub" role="status">
            {scanNote}
          </p>
        )}
      </section>

      <div className="row">
        <div className="actions">
          <button type="button" className="btn secondary" onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('/scan-history.html') })}>
            <HistoryIcon size={16} /> History
          </button>
          <button type="button" className="btn secondary" onClick={() => chrome.runtime.openOptionsPage()}>
            <SettingsIcon size={16} /> Options
          </button>
        </div>
        <span className="sub">v{chrome.runtime.getManifest().version}</span>
      </div>
    </div>
  );
};
