/**
 * scripts/make-icons.mjs – Generates the extension icons (orange lens mark on a near-black rounded square).
 *
 * No dependencies: a tiny supersampled rasteriser plus node:zlib for the PNG. Colours come from ui/tokens.css.
 * Run: node scripts/make-icons.mjs   (output is committed to public/icons)
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/ui/tokens.css'), 'utf8');
const token = (name) => {
  const hex = css.match(new RegExp(`${name}:\\s*#([0-9a-fA-F]{6})`))?.[1];
  if (!hex) throw new Error(`Missing token ${name}`);
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
};
const BG = token('--ml-bg');
const ACCENT = token('--ml-accent');
const SS = 4; // supersampling per axis

/** Signed-distance style coverage test for one sample in a unit square (0..1). */
function sample(x, y) {
  // Rounded square background.
  const r = 0.22;
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
  if (dx * dx + dy * dy > r * r) return null;
  const d = Math.hypot(x - 0.5, y - 0.5);
  // Lens ring, inner pupil and a small highlight.
  if (d <= 0.3 && d >= 0.2) return ACCENT;
  if (d <= 0.1) return ACCENT;
  if (Math.hypot(x - 0.42, y - 0.4) <= 0.04) return BG;
  return BG;
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) [px[o], px[o + 1], px[o + 2]] = [r / a, g / a, b / a].map(Math.round);
      px[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return px;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size) {
  const raw = render(size);
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) raw.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

const out = join(root, 'public/icons');
mkdirSync(out, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(out, `icon-${size}.png`), png(size));
  console.log(`icon-${size}.png`);
}
