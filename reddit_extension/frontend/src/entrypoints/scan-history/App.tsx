/**
 * entrypoints/history/App.tsx – Local scan history: search, sort, CSV/JSON export, clear all.
 *
 * Reads chrome.storage.local only. No titles, usernames or media URLs are stored, so none appear here.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { clearHistory, filterAndSort, getHistory, toCsv, toJson, type HistoryEntry, type HistorySort } from '../../core/history';
import { DEFAULT_SETTINGS, loadSettings } from '../../core/settings';
import { percent } from '../../core/verdict';
import { downloadBlob } from '../../ui/share';
import { HistoryIcon, LensIcon } from '../../ui/icons';
import { VerdictPill } from '../../ui/VerdictPill';

const COLUMNS: { key: HistorySort | null; label: string }[] = [
  { key: 'time', label: 'When' },
  { key: null, label: 'Post' },
  { key: null, label: 'Type' },
  { key: 'score', label: 'Score' },
  { key: 'label', label: 'Result' },
];

const EmptyIllustration: React.FC = () => (
  <svg width="96" height="72" viewBox="0 0 96 72" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="8" y="10" width="80" height="52" rx="8" />
    <path d="M8 24h80" />
    <path d="M20 38h28M20 48h44" />
    <circle cx="72" cy="42" r="8" />
    <path d="M78 48l6 6" />
  </svg>
);

/** Shows a short, readable path for a stored permalink. */
function shortLink(permalink: string): string {
  try {
    return new URL(permalink).pathname;
  } catch {
    return permalink;
  }
}

export const App: React.FC = () => {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<HistorySort>('time');
  const [ascending, setAscending] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [historyOn, setHistoryOn] = useState(DEFAULT_SETTINGS.saveHistory);

  useEffect(() => {
    void getHistory().then(setEntries);
    void loadSettings().then((s) => setHistoryOn(s.saveHistory));
  }, []);

  const rows = useMemo(() => filterAndSort(entries ?? [], query, sort, ascending), [entries, query, sort, ascending]);

  const chooseSort = (key: HistorySort) => {
    if (key === sort) setAscending((a) => !a);
    else {
      setSort(key);
      setAscending(false);
    }
  };

  const exportAs = (kind: 'csv' | 'json') => {
    const text = kind === 'csv' ? toCsv(rows) : toJson(rows);
    downloadBlob(new Blob([text], { type: kind === 'csv' ? 'text/csv' : 'application/json' }), `moody-lens-history.${kind}`);
  };

  const onClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    await clearHistory();
    setEntries([]);
    setConfirmClear(false);
  };

  return (
    <main className="page page-wide">
      <header className="page-header">
        <span className="logo" aria-hidden="true">
          <LensIcon size={20} />
        </span>
        <div>
          <h1>Scan history</h1>
          <p className="sub">Stored only in this browser. Results are automated estimates, not proof.</p>
        </div>
      </header>

      {!historyOn && <div className="banner">History is turned off in Options, so new scans are not saved.</div>}

      <div className="toolbar">
        <input
          className="search"
          type="search"
          aria-label="Search history"
          placeholder="Search links, result or type"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="btn secondary" disabled={rows.length === 0} onClick={() => exportAs('csv')}>
          Export CSV
        </button>
        <button type="button" className="btn secondary" disabled={rows.length === 0} onClick={() => exportAs('json')}>
          Export JSON
        </button>
        <button type="button" className={`btn ${confirmClear ? 'danger' : 'secondary'}`} disabled={(entries ?? []).length === 0} onClick={() => void onClear()}>
          {confirmClear ? 'Click again to clear all' : 'Clear all'}
        </button>
      </div>

      <div className="table-wrap">
        {rows.length === 0 ? (
          <div className="empty">
            <EmptyIllustration />
            <h2>{entries === null ? 'Loading...' : query ? 'No matches' : 'No scans yet'}</h2>
            <p>{query ? 'Try a different search.' : 'Scanned posts will show up here.'}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.label} aria-sort={c.key === sort ? (ascending ? 'ascending' : 'descending') : undefined}>
                    {c.key ? (
                      <button type="button" onClick={() => chooseSort(c.key!)}>
                        {c.label} {c.key === sort ? (ascending ? '▲' : '▼') : ''}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.postId}>
                  <td>{new Date(e.time).toLocaleString()}</td>
                  <td className="post">
                    <a href={e.permalink} target="_blank" rel="noopener noreferrer">
                      {shortLink(e.permalink)}
                    </a>
                  </td>
                  <td>{e.kind}</td>
                  <td className="num">{e.score === null ? '—' : `${percent(e.score)}%`}</td>
                  <td>
                    <VerdictPill verdict={e.label} mock={e.mock} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="sub">
        <HistoryIcon size={14} /> {(entries ?? []).length} saved scan{(entries ?? []).length === 1 ? '' : 's'} (newest 1000 are kept).
      </p>
    </main>
  );
};
