import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { checkFile, createSelectionRunner } from '../src/provenance/engine.js';
import { makeResult, STATUS_LABELS } from '../src/provenance/provenance-core.js';
import * as sdk from '../src/provenance/vendor/sdk.js';
import { createOfflineContext } from '../src/provenance/offline-settings.js';
import { offlineWorkerCheck } from '../../../Browser_Extension/backend/tests/helpers/provenance-worker-checks.mjs';

const require = createRequire(import.meta.url);
const output = await build({ entryPoints: [new URL('../src/provenance/OriginCheckCard.tsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], bundle: true, write: false, platform: 'node', format: 'esm', loader: { '.css': 'empty' }, plugins: [{ name: 'test-runtime', setup(b) {
  b.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }));
  b.onResolve({ filter: /browser-resources\.js$/ }, () => ({ path: new URL('../src/provenance/browser-resources.js', import.meta.url).href, external: true }));
} }] });
const { OriginCheckView } = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));

for (const [status, label] of Object.entries(STATUS_LABELS)) test(`origin card state: ${status}`, () => {
  const result = { ...makeResult(status), metadataInspected: true };
  const html = renderToStaticMarkup(React.createElement(OriginCheckView, { result, fileName: 'selected.png' }));
  assert.ok(html.includes('Origin check')); assert.ok(html.includes(label)); assert.ok(html.includes('Missing credentials do not prove authenticity'));
  assert.ok(!html.includes('%')); assert.ok(!html.includes('fake_probability'));
});
test('card escapes and caps filename, signer, metadata, actions and SDK codes', () => {
  const hostile = '<img src=x onerror=alert(1)>' + 'z'.repeat(2000);
  const result = { ...makeResult('untrusted_signer'), signer: hostile, claimGenerator: hostile, actions: [{ label: hostile }], reasons: [hostile], metadataHints: [{ label: hostile, value: hostile, family: 'OpenAI' }] };
  const html = renderToStaticMarkup(React.createElement(OriginCheckView, { result, fileName: hostile }));
  assert.ok(!html.includes('<img')); assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('z'.repeat(241)));
  assert.ok(html.includes('rel="noopener noreferrer"')); assert.ok(html.includes('target="_blank"')); assert.ok(html.includes('unsigned'));
});
test('WASM startup failure degrades to website-specific advice', () => {
  const result = { ...makeResult('unavailable'), diagnosticCode: 'sdk_initialization_failed', message: 'Reload the extension; inspect side panel DevTools.' };
  const html = renderToStaticMarkup(React.createElement(OriginCheckView, { result }));
  assert.ok(html.includes('reload this page')); assert.ok(!html.includes('Reload the extension'));
});
test('website actual worker compiles WASM outside the parent and makes zero verification network calls', async () => {
  await offlineWorkerCheck({ sdk, createOfflineContext, entry: new URL('../src/provenance/c2pa-worker.js', import.meta.url), vendor: new URL('../../../Browser_Extension/frontend/provenance/vendor/c2pa/', import.meta.url), compileInWorker: true });
});
test('website reads original File bytes, omits source hosts, and handles verifier failure', async () => {
  const original = await readFile(new URL('../../../Browser_Extension/backend/tests/fixtures/provenance/signed.png', import.meta.url));
  const file = new File([original], 'selected.png', { type: 'image/png' });
  const result = await checkFile(file, { verify: async bytes => { assert.deepEqual(Buffer.from(bytes), original); return { kind: 'unavailable', diagnosticCode: 'sdk_load_failed' }; } });
  assert.equal(result.status, 'unavailable'); assert.equal(result.metadataInspected, true); assert.equal(result.reencodedPlatform, null);
  assert.equal((await checkFile({ size: 9 * 1024 * 1024, arrayBuffer() { assert.fail('must reject before reading'); } })).diagnosticCode, 'size_limit_exceeded');
});
test('quick switches, clear and disposal suppress old file results and abort work', async () => {
  const pending = new Map(), emitted = [];
  const runner = createSelectionRunner((file, options) => new Promise(resolve => pending.set(file, { resolve, signal: options.signal })), value => emitted.push(value));
  const a = {}, b = {}; const first = runner.run(a), second = runner.run(b);
  assert.equal(pending.get(a).signal.aborted, true);
  pending.get(b).resolve(makeResult('no_credentials')); await second;
  pending.get(a).resolve(makeResult('verified')); await first;
  assert.equal(emitted.at(-1).file, b);
  const third = runner.run(a); await runner.run(null); pending.get(a).resolve(makeResult('verified')); await third;
  assert.equal(emitted.at(-1).file, null);
  const fourth = runner.run(b); runner.dispose(); const count = emitted.length;
  assert.equal(pending.get(b).signal.aborted, true); pending.get(b).resolve(makeResult('verified')); await fourth; assert.equal(emitted.length, count);
});
