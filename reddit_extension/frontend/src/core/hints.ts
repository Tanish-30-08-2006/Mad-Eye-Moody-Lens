/**
 * core/hints.ts – Local provenance hints from file bytes: C2PA markers, PNG text chunks, AI-tool strings.
 *
 * Runs in the service worker without uploading anything. Hints are NOT proof: Reddit often strips
 * metadata, and nothing here validates a C2PA signature.
 */

import type { ProvenanceHint } from './scan-meta';

/** Only the start of a file is read: metadata lives in the header, and video files can be huge. */
export const HINT_SCAN_BYTES = 1024 * 1024;
const MAX_HINTS = 6;

/** Tool names that rarely occur by accident in image metadata. */
const TOOL_NAMES = [
  'Midjourney',
  'DALL-E',
  'DALL·E',
  'Stable Diffusion',
  'Adobe Firefly',
  'ComfyUI',
  'NovelAI',
  'InvokeAI',
  'Leonardo.Ai',
  'Ideogram',
  'OpenAI',
];

/** IPTC / XMP "digital source type" values that mean AI-made or AI-composited. */
const AI_SOURCE_PATTERN = /(compositeWithTrainedAlgorithmicMedia|trainedAlgorithmicMedia|compositeSynthetic|algorithmicMedia)/;

/** PNG text keywords written by popular generators, with a plain description (the value is never read out). */
const PNG_KEYWORDS: Record<string, string> = {
  parameters: 'Stable Diffusion-style generation parameters',
  'sd-metadata': 'Stable Diffusion metadata',
  sd_metadata: 'Stable Diffusion metadata',
  prompt: 'a ComfyUI-style prompt graph',
  workflow: 'a ComfyUI-style workflow',
  invokeai_metadata: 'InvokeAI metadata',
  invokeai_graph: 'InvokeAI metadata',
  dream: 'Dream/InvokeAI metadata',
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Bytes as a latin1 string so ASCII markers can be matched with plain string search. */
function toLatin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.length)));
  }
  return out;
}

/** Walks PNG chunks (stopping at image data) and returns text-chunk keywords with their values when uncompressed. */
function pngTextChunks(bytes: Uint8Array): { keyword: string; value: string }[] {
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found: { keyword: string; value: string }[] = [];
  let pos = 8;
  for (let chunks = 0; chunks < 200 && pos + 8 <= bytes.length; chunks++) {
    const length = view.getUint32(pos);
    const type = toLatin1(bytes.subarray(pos + 4, pos + 8));
    if (type === 'IDAT' || type === 'IEND') break;
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const body = bytes.subarray(pos + 8, Math.min(pos + 8 + length, bytes.length));
      const end = body.indexOf(0);
      if (end > 0) {
        found.push({ keyword: toLatin1(body.subarray(0, end)), value: type === 'tEXt' ? toLatin1(body.subarray(end + 1)) : '' });
      }
    }
    pos += 12 + length;
  }
  return found;
}

export function detectProvenanceHints(bytes: Uint8Array): ProvenanceHint[] {
  const head = bytes.length > HINT_SCAN_BYTES ? bytes.subarray(0, HINT_SCAN_BYTES) : bytes;
  const text = toLatin1(head);
  const hints: ProvenanceHint[] = [];

  // A JUMBF box labelled c2pa holds Content Credentials; we only note that it exists.
  if (text.includes('jumb') && text.includes('c2pa')) {
    hints.push({ kind: 'c2pa', text: 'Content Credentials (C2PA) data is present. Moody Lens does not verify it.' });
  }

  const source = AI_SOURCE_PATTERN.exec(text);
  if (source) {
    hints.push({ kind: 'ai_metadata', text: `Metadata declares an AI digital source type ("${source[1]}").` });
  }

  const pngSeen = new Set<string>();
  for (const { keyword, value } of pngTextChunks(head)) {
    const description = PNG_KEYWORDS[keyword.toLowerCase()];
    if (description && !pngSeen.has(keyword)) {
      pngSeen.add(keyword);
      hints.push({ kind: 'png_text', text: `PNG text field "${keyword}" is present (${description}).` });
    }
    if (keyword === 'Software' && value) {
      const tool = TOOL_NAMES.find((name) => value.includes(name));
      if (tool) hints.push({ kind: 'tool_name', text: `Software field mentions "${tool}".` });
    }
  }

  for (const name of TOOL_NAMES) {
    if (text.includes(name) && !hints.some((h) => h.text.includes(`"${name}"`))) {
      hints.push({ kind: 'tool_name', text: `Metadata mentions "${name}".` });
    }
  }
  return hints.slice(0, MAX_HINTS);
}

/** Reads the start of a blob and returns its hints; never throws. */
export async function hintsFromBlob(blob: Blob): Promise<ProvenanceHint[]> {
  try {
    const bytes = new Uint8Array(await blob.slice(0, HINT_SCAN_BYTES).arrayBuffer());
    return detectProvenanceHints(bytes);
  } catch {
    return [];
  }
}

export const HINTS_NOTE = 'Provenance hints (not proof; Reddit often strips metadata)';
