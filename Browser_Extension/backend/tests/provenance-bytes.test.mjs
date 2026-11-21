import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { acquireBytes, decodeDataImage, MAX_BYTES } from '../../frontend/provenance/bytes.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex'); // test assertions only, never displayed/persisted by the feature

test('data URIs and streamed fetch preserve SHA-256 of every original fixture', async () => {
  for (const name of ['signed.png', 'untrusted.png', 'corrupted-signature.png', 'stable-diffusion.png', 'stripped.jpg', 'truncated.png']) {
    const original = await readFile(new URL(`./fixtures/provenance/${name}`, import.meta.url));
    const fromUri = await acquireBytes(`data:image/png;base64,${original.toString('base64')}`);
    assert.equal(sha(fromUri.bytes), sha(original));
    const fetched = await acquireBytes('https://images.example/test', { fetchImpl: async (_url, options) => {
      assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
      assert.equal(options.referrerPolicy, 'no-referrer');
      return new Response(new ReadableStream({ start(c) { c.enqueue(original.subarray(0, 13)); c.enqueue(original.subarray(13)); c.close(); } }), { headers: { 'content-type': 'application/octet-stream' } });
    } });
    assert.equal(sha(fetched.bytes), sha(original));
  }
});

test('percent encoding decodes raw bytes without UTF-8 or pixel normalization', () => {
  assert.deepEqual([...decodeDataImage('data:image/png,%00%ff%80+A').bytes], [0, 255, 128, 43, 65]);
  for (const value of ['data:image/png;base64,!!!!', 'data:text/plain;base64,YQ==', 'data:image/png,%zz', 'data:image/png;base64,']) assert.throws(() => decodeDataImage(value));
});

test('public-host rules reject credentials, local/private/encoded IPs and unsafe schemes before fetch', async () => {
  for (const host of ['localhost', 'localhost.', 'printer.local', 'intranet', '127.1', '2130706433', '0x7f000001', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '[::1]', '[::ffff:127.0.0.1]', '[fd00::1]', '[fe80::1]', '[ff02::1]']) {
    await assert.rejects(acquireBytes(`http://${host}/x`, { fetchImpl: () => assert.fail('must not fetch') }));
  }
  for (const source of ['file:///image.jpg', 'ftp://example.com/image', 'https://u:p@example.com/image', 'blob:https://example.com/image']) await assert.rejects(acquireBytes(source));
});

test('enforces encoded, declared and streamed 8 MiB limits', async () => {
  assert.throws(() => decodeDataImage('data:image/png;base64,' + 'A'.repeat(Math.ceil(MAX_BYTES / 3) * 4 + 4)));
  await assert.rejects(acquireBytes('https://example.com/image', { fetchImpl: async () => new Response('x', { headers: { 'content-length': String(MAX_BYTES + 1) } }) }), /8 MB/);
  let cancelled = false;
  await assert.rejects(acquireBytes('https://example.com/image', { fetchImpl: async () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MAX_BYTES)); c.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; } })) }), /8 MB/);
  assert.equal(cancelled, true);
});

test('timeouts cover fetch and body; cancellation and HTTP errors suggest upload', async () => {
  await assert.rejects(acquireBytes('https://example.com/image', { timeoutMs: 5, fetchImpl: () => new Promise(() => {}) }), /Upload/);
  await assert.rejects(acquireBytes('https://example.com/image', { timeoutMs: 5, fetchImpl: async () => new Response(new ReadableStream({ start() {} })) }), /Upload/);
  await assert.rejects(acquireBytes('https://example.com/image', { fetchImpl: async () => new Response('denied', { status: 403 }) }), /Upload/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(acquireBytes('data:image/png;base64,YQ==', { signal: controller.signal }));
});
