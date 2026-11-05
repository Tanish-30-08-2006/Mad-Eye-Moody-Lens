// @vitest-environment happy-dom
/**
 * tests/unit/share-blur-verdict.test.ts – Share text, result card (canvas mocked), blur, thresholds, tokens contrast.
 * Labels: RUNTIME (all except the tokens test, which is STATIC: it reads tokens.css).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { CARD_SIZE, createCardBlob, drawCard, modReportText, redditComment, searchLinks, summaryText, SEARCH_NOTE, type CardPalette } from '../../src/ui/share';
import { applyBlur, removeBlur } from '../../src/ui/blur';
import { DISCLAIMER, verdictForScore, verdictOf, VERDICT_TEXT } from '../../src/core/verdict';

const data = { score: 0.82, verdict: 'likely_fake' as const, mock: false, permalink: 'https://www.reddit.com/r/x/comments/a/', username: 'bob', title: 'T' };
const palette: CardPalette = { bg: '#000', surface: '#111', border: '#222', text: '#eee', muted: '#999', accent: '#f40', verdict: '#e55' };

describe('share', () => {
  it('uses probabilistic wording and the disclaimer everywhere', () => {
    for (const text of [summaryText(data), redditComment(data), modReportText(data)]) {
      expect(text).toContain(DISCLAIMER);
      expect(text).toMatch(/likely manipulated/i);
      expect(text).not.toMatch(/\b(is fake|definitely|proven)\b/i);
    }
    expect(summaryText({ ...data, mock: true })).toMatch(/DEMO DATA/);
  });

  it('search links are plain links to the three sites, with a note about the URL being sent', () => {
    const links = searchLinks('https://i.redd.it/a.jpg');
    expect(links).toHaveLength(3);
    expect(links.every((l) => l.href.startsWith('https://') && l.href.includes(encodeURIComponent('https://i.redd.it/a.jpg')))).toBe(true);
    expect(SEARCH_NOTE).toMatch(/URL/);
  });

  it('draws the card without any media pixels or the username', () => {
    const calls: string[] = [];
    const texts: string[] = [];
    const ctx = new Proxy({ fillText: (t: string) => texts.push(t) } as Record<string, unknown>, {
      get: (t, k: string) => (k in t ? t[k] : (...a: unknown[]) => void calls.push(`${k}${a.length}`)),
      set: (t, k: string, v) => ((t[k] = v), true),
    });
    drawCard(ctx as never, data, palette);
    expect(calls.some((c) => c.startsWith('drawImage'))).toBe(false);
    const all = texts.join(' ');
    expect(all).toContain(DISCLAIMER);
    expect(all).not.toContain('bob');
  });

  it('creates a PNG blob through a mocked canvas', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    const ctx = new Proxy({} as Record<string, unknown>, { get: (t, k: string) => t[k] ?? (() => undefined), set: (t, k: string, v) => ((t[k] = v), true) });
    const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (cb: (b: Blob) => void) => cb(blob) };
    const doc = { createElement: vi.fn(() => canvas) } as unknown as Document;
    expect(await createCardBlob(data, palette, doc)).toBe(blob);
    expect(canvas.width).toBe(CARD_SIZE.width);
  });
});

describe('blur', () => {
  it('applies and fully restores the previous inline filter', () => {
    const a = document.createElement('img');
    a.style.filter = 'contrast(1)';
    const b = document.createElement('img');
    applyBlur([a, b]);
    expect(a.style.filter).toContain('blur');
    removeBlur([a, b]);
    expect(a.style.filter).toBe('contrast(1)');
    expect(b.style.filter).toBe('');
  });
});

describe('thresholds', () => {
  it('computes labels client-side with defaults and custom thresholds', () => {
    expect(verdictForScore(0.7)).toBe('likely_fake');
    expect(verdictForScore(0.3)).toBe('likely_real');
    expect(verdictForScore(0.5)).toBe('inconclusive');
    expect(verdictForScore(0.5, { realBelow: 0.6, fakeAbove: 0.9 })).toBe('likely_real');
    expect(verdictOf({ overall_score: null, label: 'likely_real' })).toBe('likely_real');
    expect(VERDICT_TEXT.likely_real).toBe('Likely authentic');
  });
});

/** WCAG contrast ratio for two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('tokens (STATIC)', () => {
  const css = readFileSync('src/ui/tokens.css', 'utf8');
  const [darkBlock, lightBlock] = [css.slice(0, css.indexOf('@media (prefers-color-scheme: light)')), css.slice(css.indexOf('@media (prefers-color-scheme: light)'))];
  const read = (block: string, name: string, fallback?: Record<string, string>) =>
    block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\b`))?.[1] ?? (fallback ? fallback[name] : undefined)!;
  const dark = Object.fromEntries(['--ml-surface', '--ml-bg', '--ml-text', '--ml-muted', '--ml-fake-text', '--ml-real-text', '--ml-warn-text', '--ml-accent-text', '--ml-on-accent', '--ml-accent'].map((n) => [n, read(darkBlock, n)!]));
  const light = Object.fromEntries(Object.keys(dark).map((n) => [n, read(lightBlock, n, dark)!]));

  it.each([['dark', dark], ['light', light]])('text tokens reach 4.5:1 on the surface (%s)', (_n, t) => {
    for (const k of ['--ml-text', '--ml-muted', '--ml-fake-text', '--ml-real-text', '--ml-warn-text', '--ml-accent-text']) {
      expect(contrast(t[k]!, t['--ml-surface']!), k).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('text on the accent reaches 4.5:1', () => {
    expect(contrast(dark['--ml-on-accent']!, dark['--ml-accent']!)).toBeGreaterThanOrEqual(4.5);
  });
});
