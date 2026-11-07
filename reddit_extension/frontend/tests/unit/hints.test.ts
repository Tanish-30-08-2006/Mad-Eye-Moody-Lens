/**
 * tests/unit/hints.test.ts – Provenance hint detector on synthetic bytes. Label: RUNTIME.
 */
import { describe, it, expect } from 'vitest';
import { detectProvenanceHints, HINTS_NOTE } from '../../src/core/hints';

const ascii = (s: string) => Uint8Array.from(Array.from(s, (c) => c.charCodeAt(0)));
const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => Array.from(p)));
const u32 = (n: number) => Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const chunk = (type: string, body: Uint8Array) => concat(u32(body.length), ascii(type), body, u32(0));
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('provenance hints', () => {
  it('says plainly that hints are not proof', () => {
    expect(HINTS_NOTE).toMatch(/not proof/);
  });

  it('finds a C2PA/JUMBF marker', () => {
    const hints = detectProvenanceHints(ascii('xxjumb....c2pa....'));
    expect(hints.map((h) => h.kind)).toContain('c2pa');
  });

  it('finds PNG text chunks written by generators', () => {
    const body = concat(ascii('parameters'), Uint8Array.of(0), ascii('a cat, Steps: 20'));
    const bytes = concat(PNG, chunk('tEXt', body), chunk('IDAT', Uint8Array.of(1)));
    expect(detectProvenanceHints(bytes).some((h) => h.kind === 'png_text' && h.text.includes('parameters'))).toBe(true);
  });

  it('finds AI tool names and source-type strings in EXIF/IPTC text', () => {
    expect(detectProvenanceHints(ascii('....Midjourney....')).some((h) => h.kind === 'tool_name')).toBe(true);
    expect(detectProvenanceHints(ascii('digitalsourcetype/trainedAlgorithmicMedia')).some((h) => h.kind === 'ai_metadata')).toBe(true);
  });

  it('returns nothing for plain bytes', () => {
    expect(detectProvenanceHints(ascii('just a normal jpeg body'))).toEqual([]);
  });
});
