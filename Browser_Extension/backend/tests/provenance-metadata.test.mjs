import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { readMetadata, LIMITS } from '../../frontend/provenance/metadata-reader.js';

const fixture = name => readFile(new URL(`./fixtures/provenance/${name}`, import.meta.url));
const png = (...chunks) => Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), ...chunks, chunk('IEND', Buffer.alloc(0))]);
function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length); out.write(type, 4); data.copy(out, 8);
  return out; // CRC is irrelevant to this hint-only parser, never to SDK verification.
}
function exif(value) {
  const tiff = Buffer.alloc(26 + value.length + 1);
  tiff.write('II'); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8); tiff.writeUInt16LE(0x131, 10); tiff.writeUInt16LE(2, 12);
  tiff.writeUInt32LE(value.length + 1, 14); tiff.writeUInt32LE(26, 18); tiff.write(value, 26);
  return tiff;
}
function jpegSegment(marker, data) {
  const header = Buffer.alloc(4); header[0] = 255; header[1] = marker; header.writeUInt16BE(data.length + 2, 2);
  return Buffer.concat([header, data]);
}

for (const name of ['plain.png', 'stable-diffusion.png', 'compressed-metadata.png', 'stripped.jpg', 'large-stripped.jpg', 'signed.png', 'untrusted.png', 'corrupted-signature.png', 'truncated.png']) {
  test(`fixture parser expectations: ${name}`, async () => {
    const expected = JSON.parse(await fixture(`${name}.expected.json`));
    const actual = await readMetadata(await fixture(name));
    assert.equal(actual.format, expected.format);
    assert.equal(actual.marker, expected.marker);
    assert.deepEqual(actual.metadataHints.map(h => h.label), expected.hintLabels);
    for (const hint of actual.metadataHints) { assert.equal(hint.unsigned, true); assert.ok(hint.value.length <= LIMITS.text); }
  });
}

test('JPEG EXIF Software and XMP are unsigned hints; remote manifest is flagged without fetching', async () => {
  const bytes = Buffer.concat([Buffer.from([255, 216]), jpegSegment(0xe1, Buffer.concat([Buffer.from('Exif\0\0'), exif('Stable Diffusion')])), jpegSegment(0xe1, Buffer.from('<xmp CreatorTool="ComfyUI" dcterms:provenance="https://private.example/manifest"/>')), Buffer.from([255, 217])]);
  const result = await readMetadata(bytes);
  assert.equal(result.marker, 'absent'); assert.equal(result.remoteManifestNotFetched, true);
  assert.ok(result.metadataHints.some(h => h.label === 'Software / EXIF'));
  assert.ok(result.metadataHints.some(h => h.value === 'ComfyUI'));
});

test('PNG signature recognition is independent of browser Latin-1/Windows-1252 aliases', async () => {
  const NativeDecoder = globalThis.TextDecoder;
  globalThis.TextDecoder = class {
    constructor(label) { this.native = new NativeDecoder(label); this.latin = label === 'latin1'; }
    decode(bytes) { const text = this.native.decode(bytes); return this.latin ? text.replace(/\x89/g, '\u2030') : text; }
  };
  try {
    const { readMetadata: browserReader } = await import('../../frontend/provenance/metadata-reader.js?encoding-alias-check');
    assert.equal((await browserReader(await fixture('signed.png'))).marker, 'present');
    assert.equal((await browserReader(await fixture('stable-diffusion.png'))).format, 'image/png');
  } finally { globalThis.TextDecoder = NativeDecoder; }
});

test('WebP EXIF, XMP and C2PA chunks are bounded', async () => {
  function riffChunk(type, bytes) { const out = Buffer.alloc(8 + bytes.length + (bytes.length & 1)); out.write(type); out.writeUInt32LE(bytes.length, 4); bytes.copy(out, 8); return out; }
  const chunks = Buffer.concat([riffChunk('EXIF', exif('ComfyUI')), riffChunk('XMP ', Buffer.from('<xmp Software="Stable Diffusion"/>')), riffChunk('C2PA', Buffer.from('test'))]);
  const header = Buffer.alloc(12); header.write('RIFF'); header.writeUInt32LE(chunks.length + 4, 4); header.write('WEBP', 8);
  const result = await readMetadata(Buffer.concat([header, chunks]));
  assert.equal(result.format, 'image/webp'); assert.equal(result.marker, 'present'); assert.ok(result.metadataHints.length >= 2);
});

test('compressed bombs, truncated iTXt, huge chunks and malicious text are safe', async () => {
  const bomb = Buffer.concat([Buffer.from('parameters\0\0'), deflateSync(Buffer.alloc(LIMITS.chunk * 8, 65))]);
  const malicious = '<img src=x onerror=alert(1)>' + 'x'.repeat(1000);
  const result = await readMetadata(png(chunk('zTXt', bomb), chunk('iTXt', Buffer.from('prompt\0\x01')), chunk('tEXt', Buffer.from(`parameters\0${malicious}`))));
  assert.equal(result.metadataHints.length, 1); assert.equal(result.metadataHints[0].value, malicious.slice(0, 240));
  assert.equal((await readMetadata(png(chunk('tEXt', Buffer.alloc(LIMITS.chunk + 1))))).metadataHints.length, 0);
  assert.equal((await readMetadata(Buffer.alloc(LIMITS.file + 1))).marker, 'unknown');
});

test('deterministic fuzz and all truncations never throw or falsely establish verification', async () => {
  let seed = 42;
  for (let i = 0; i < 500; i++) {
    const bytes = Buffer.alloc(i % 257);
    for (let j = 0; j < bytes.length; j++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; bytes[j] = seed & 255; }
    const result = await readMetadata(bytes);
    assert.ok(result.metadataHints.length <= LIMITS.hints); assert.equal(result.status, undefined);
  }
  for (const name of ['stable-diffusion.png', 'stripped.jpg']) {
    const bytes = await fixture(name);
    for (let i = 0; i < bytes.length; i++) await readMetadata(bytes.subarray(0, i));
  }
});

test('many compressed bombs cannot cause unbounded inflation work', async () => {
  const NativeStream = globalThis.DecompressionStream;
  let attempts = 0;
  globalThis.DecompressionStream = class { constructor(format) { attempts++; return new NativeStream(format); } };
  try {
    const bomb = chunk('zTXt', Buffer.concat([Buffer.from('Software\0\0'), deflateSync(Buffer.alloc(LIMITS.chunk * 2, 65))]));
    const result = await readMetadata(png(...Array(100).fill(bomb)));
    assert.equal(attempts, LIMITS.inflations); assert.equal(result.metadataHints.length, 0);
  } finally { globalThis.DecompressionStream = NativeStream; }
});
