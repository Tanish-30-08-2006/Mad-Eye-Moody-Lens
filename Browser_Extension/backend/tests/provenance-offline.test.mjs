import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as sdk from '../../frontend/provenance/vendor/c2pa/sdk.js';
import { createOfflineContext } from '../../frontend/provenance/offline-settings.js';
import { classifyC2pa } from '../../frontend/provenance/provenance-core.js';
import { offlineWorkerCheck } from './helpers/provenance-worker-checks.mjs';
import { loadWorkerSdk } from '../../frontend/provenance/worker-network.js';

test('SDK initialization messages are queued until packaged module loading completes', async () => {
  const scope = new EventTarget(), received = [];
  let finish;
  const ready = loadWorkerSdk(scope, () => new Promise(resolve => { finish = () => { scope.addEventListener('message', event => received.push(event.data)); resolve(); }; }));
  scope.dispatchEvent(new MessageEvent('message', { data: 'init' }));
  assert.deepEqual(received, []); finish(); await ready;
  scope.dispatchEvent(new MessageEvent('message', { data: 'read' }));
  assert.deepEqual(received, ['init', 'read']);
});

test('extension: actual hardened worker and effective SDK settings make zero verification network calls', async () => {
  const stores = await offlineWorkerCheck({ sdk, createOfflineContext, entry: new URL('../../frontend/provenance/c2pa-worker.js', import.meta.url), vendor: new URL('../../frontend/provenance/vendor/c2pa/', import.meta.url) });
  assert.equal(classifyC2pa({ kind: 'manifest', store: stores[1] }).status, 'untrusted_signer');
  const expired = classifyC2pa({ kind: 'manifest', store: stores[2] });
  assert.notEqual(expired.status, 'invalid'); assert.equal(expired.reasonCode, 'certificate_expired');
});

test('trust-only SDK Invalid is Unknown signer; malformed and unknown failures are separate from mismatch', async () => {
  const pristine = JSON.parse(await readFile(new URL('./fixtures/provenance/signed.sdk-untrusted.json', import.meta.url)));
  pristine.validation_state = 'Invalid';
  assert.equal(classifyC2pa({ kind: 'manifest', store: pristine }).status, 'untrusted_signer');
  assert.equal(classifyC2pa({ kind: 'manifest', store: pristine }).certificateType, 'not_established');
  for (const [code, status, reason] of [['claim.malformed', 'unavailable', 'malformed_manifest'], ['future.failure', 'unavailable', 'validation_incomplete'], ['assertion.dataHash.mismatch', 'invalid', 'integrity_mismatch']]) {
    const store = structuredClone(pristine); store.validation_results.activeManifest.failure.push({ code });
    const result = classifyC2pa({ kind: 'manifest', store }); assert.equal(result.status, status); assert.equal(result.reasonCode, reason);
  }
});

test('manifest CSP is unchanged; the network ban is scoped to the verifier', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../manifest.json', import.meta.url)));
  assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';");
  assert.ok(manifest.host_permissions.includes('https://api.bitmind.ai/*'));
  // Existing background/provider suites make the detector requests; byte tests
  // exercise original-image downloads. Neither runs inside the hardened worker.
});
