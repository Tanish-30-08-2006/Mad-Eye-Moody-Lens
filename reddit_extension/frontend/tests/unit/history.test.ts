/**
 * tests/unit/history.test.ts – Local history store, export and filtering. Label: RUNTIME (fake chrome.storage).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { addHistory, clearHistory, filterAndSort, getHistory, toCsv, toJson, MAX_HISTORY_ENTRIES, type HistoryEntry } from '../../src/core/history';
import { installFakeChrome, removeFakeChrome } from '../helpers/fake-chrome';

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  postId: 't3_a', permalink: 'https://www.reddit.com/r/x/comments/a/', kind: 'image', score: 0.8, label: 'likely_fake', mock: false, time: 1000, ...over,
});

beforeEach(() => void installFakeChrome());
afterEach(() => removeFakeChrome());

describe('history', () => {
  it('stores only the allowed fields and dedupes by post id', async () => {
    await addHistory({ ...entry(), title: 'secret title', user: 'bob' } as HistoryEntry);
    await addHistory(entry({ score: 0.2, label: 'likely_real', time: 2000 }));
    const all = await getHistory();
    expect(all).toHaveLength(1);
    expect(all[0]!.score).toBe(0.2);
    expect(Object.keys(all[0]!).sort()).toEqual(['kind', 'label', 'mock', 'permalink', 'postId', 'score', 'time']);
  });

  it('caps the list and clears', async () => {
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 5; i++) await addHistory(entry({ postId: `t3_${i}`, time: i }));
    expect(await getHistory()).toHaveLength(MAX_HISTORY_ENTRIES);
    await clearHistory();
    expect(await getHistory()).toEqual([]);
  });

  it('exports CSV (formula-safe) and JSON', () => {
    const csv = toCsv([entry({ permalink: '=HYPERLINK("x")' })]);
    expect(csv.split('\n')[0]).toContain('postId');
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/);
    expect(JSON.parse(toJson([entry()]))).toHaveLength(1);
  });

  it('searches and sorts', () => {
    const rows = [entry({ postId: 't3_a', score: 0.1, label: 'likely_real', time: 1 }), entry({ postId: 't3_b', score: 0.9, time: 2 })];
    expect(filterAndSort(rows, '', 'score', false)[0]!.postId).toBe('t3_b');
    expect(filterAndSort(rows, '', 'time', true)[0]!.postId).toBe('t3_a');
    expect(filterAndSort(rows, 'authentic', 'time')).toHaveLength(0);
    expect(filterAndSort(rows, 't3_a', 'time')).toHaveLength(1);
  });
});
