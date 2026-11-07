/**
 * ui/share.ts – Everything the share buttons produce: text snippets, reverse-search links, the result card.
 *
 * All of it is user-initiated and nothing is posted anywhere. The card holds no media pixels,
 * no username and no link to the post.
 */

import { DISCLAIMER, VERDICT_TEXT, percent, type Verdict } from '../core/verdict';

export interface ShareData {
  score: number | null;
  verdict: Verdict;
  /** Demo data: every export says so. */
  mock: boolean;
  permalink?: string;
  disclosedAi?: boolean;
  time?: Date;
}

const BRAND = 'Moody Lens';

function scoreText(d: ShareData): string {
  return d.score === null ? 'no score' : `${percent(d.score)}% estimated probability of manipulation`;
}

const DEMO_NOTE = 'DEMO DATA: this is not a real analysis.';

export function summaryText(d: ShareData): string {
  const lines = [`${BRAND}: ${VERDICT_TEXT[d.verdict]} (${scoreText(d)}).`, `${DISCLAIMER}.`];
  if (d.mock) lines.push(DEMO_NOTE);
  return lines.join(' ');
}

/** Markdown the user can paste into a Reddit comment. */
export function redditComment(d: ShareData): string {
  const lines = [`**${BRAND} scan:** ${VERDICT_TEXT[d.verdict]}${d.score === null ? '' : ` (${percent(d.score)}%)`}`, '', `> ${DISCLAIMER}.`];
  if (d.disclosedAi) lines.push('>', '> The author disclosed this post as AI-made.');
  if (d.mock) lines.push('>', `> **${DEMO_NOTE}**`);
  lines.push('', `^(Scanned with ${BRAND})`);
  return lines.join('\n');
}

/** Neutral text for a moderator report: describes the estimate, makes no accusation. */
export function modReportText(d: ShareData): string {
  const lines = [
    'This post may contain AI-generated or manipulated media.',
    `An automated scan (${BRAND}) rated it "${VERDICT_TEXT[d.verdict].toLowerCase()}" with ${scoreText(d)}.`,
    `${DISCLAIMER}; please review it yourself.`,
  ];
  if (d.permalink) lines.push(`Post: ${d.permalink}`);
  if (d.mock) lines.push(DEMO_NOTE);
  return lines.join('\n');
}

export interface SearchLink {
  id: 'google-lens' | 'tineye' | 'bing';
  label: string;
  href: string;
}

/** Reverse-image-search links. They are only opened on click, and the image URL is sent to that site. */
export function searchLinks(imageUrl: string): SearchLink[] {
  const u = encodeURIComponent(imageUrl);
  return [
    { id: 'google-lens', label: 'Google Lens', href: `https://lens.google.com/uploadbyurl?url=${u}` },
    { id: 'tineye', label: 'TinEye', href: `https://tineye.com/search?url=${u}` },
    { id: 'bing', label: 'Bing Visual Search', href: `https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${u}` },
  ];
}

export const SEARCH_NOTE = "Opening a link sends this image's URL to that site.";

/** Copies text to the clipboard (user gesture required); falls back to a hidden textarea. */
export async function copyText(text: string, doc: Document = document): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    doc.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = doc.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

// ── Result card (canvas) ─────────────────────────────────────────────────────

/** Colours for the card, read from the CSS tokens so none are hardcoded here. */
export interface CardPalette {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  verdict: string;
}

const VERDICT_TOKEN: Record<Verdict, string> = { likely_fake: '--ml-fake', likely_real: '--ml-real', inconclusive: '--ml-warn' };

export function readPalette(el: Element, verdict: Verdict, mock: boolean): CardPalette {
  const style = getComputedStyle(el);
  const token = (name: string) => style.getPropertyValue(name).trim() || 'currentColor';
  return {
    bg: token('--ml-bg'),
    surface: token('--ml-surface'),
    border: token('--ml-border'),
    text: token('--ml-text'),
    muted: token('--ml-muted'),
    accent: token('--ml-accent'),
    verdict: token(mock ? '--ml-mock' : VERDICT_TOKEN[verdict]),
  };
}

export const CARD_SIZE = { width: 720, height: 380 } as const;

/** The 2D-context surface the card needs; real canvases and test doubles both satisfy it. */
export type CardContext = Pick<
  CanvasRenderingContext2D,
  'fillRect' | 'strokeRect' | 'fillText' | 'beginPath' | 'arc' | 'stroke' | 'setLineDash' | 'roundRect' | 'fill'
> & { fillStyle: string | CanvasGradient | CanvasPattern; strokeStyle: string | CanvasGradient | CanvasPattern; lineWidth: number; font: string; textAlign: CanvasTextAlign; lineCap: CanvasLineCap };

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function drawCard(ctx: CardContext, d: ShareData, palette: CardPalette): void {
  const { width, height } = CARD_SIZE;
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = palette.surface;
  ctx.strokeStyle = d.mock ? palette.verdict : palette.border;
  ctx.lineWidth = 2;
  ctx.setLineDash(d.mock ? [8, 6] : []);
  ctx.beginPath();
  ctx.roundRect(24, 24, width - 48, height - 48, 24);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textAlign = 'left';
  ctx.fillStyle = palette.accent;
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText(BRAND, 64, 88);

  // Ring: full track in border colour, verdict-coloured arc for the score.
  const cx = 180;
  const cy = 215;
  const radius = 72;
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.strokeStyle = palette.border;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  if (d.score !== null) {
    ctx.strokeStyle = palette.verdict;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.max(0, d.score)));
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = palette.text;
  ctx.font = `600 44px ${FONT}`;
  ctx.fillText(d.score === null ? 'n/a' : `${percent(d.score)}%`, cx, cy + 15);

  ctx.textAlign = 'left';
  ctx.fillStyle = palette.verdict;
  ctx.font = `600 36px ${FONT}`;
  ctx.fillText(VERDICT_TEXT[d.verdict], 300, 200);
  ctx.fillStyle = palette.muted;
  ctx.font = `400 20px ${FONT}`;
  ctx.fillText(DISCLAIMER, 300, 240);
  if (d.disclosedAi) ctx.fillText('The author disclosed this post as AI-made.', 300, 270);
  if (d.mock) {
    ctx.fillStyle = palette.verdict;
    ctx.font = `600 20px ${FONT}`;
    ctx.fillText('DEMO DATA', 300, 306);
  }

  ctx.fillStyle = palette.muted;
  ctx.font = `400 16px ${FONT}`;
  ctx.fillText(`Scanned with ${BRAND} · ${(d.time ?? new Date()).toISOString().slice(0, 10)}`, 64, height - 56);
}

/** Renders the card to a PNG blob; null if the canvas is unavailable. */
export async function createCardBlob(d: ShareData, palette: CardPalette, doc: Document = document): Promise<Blob | null> {
  const canvas = doc.createElement('canvas');
  canvas.width = CARD_SIZE.width;
  canvas.height = CARD_SIZE.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawCard(ctx, d, palette);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

/** Saves a blob through a temporary link (user-initiated download). */
export function downloadBlob(blob: Blob, filename: string, doc: Document = document): void {
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = filename;
  doc.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
