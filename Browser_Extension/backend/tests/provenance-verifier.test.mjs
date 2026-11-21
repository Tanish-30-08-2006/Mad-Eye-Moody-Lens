import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import init, { WasmReader } from '../../frontend/provenance/vendor/c2pa/wasm-bindings.js';
import { Context, Reader } from '../../frontend/provenance/vendor/c2pa/sdk.js';
import { verifyC2pa, VERIFY_SETTINGS, sdkReadError } from '../../frontend/provenance/c2pa-verifier.js';
import { checkProvenance, classifyC2pa, unavailableResult } from '../../frontend/provenance/provenance-core.js';
import { readMetadata } from '../../frontend/provenance/metadata-reader.js';

const fixture = name => readFile(new URL(`./fixtures/provenance/${name}`, import.meta.url));
const json = async name => JSON.parse(await fixture(name));
const vendor = new URL('../../frontend/provenance/vendor/c2pa/', import.meta.url);
const codes = store => Object.fromEntries(['success', 'failure', 'informational'].map(k => [k, [...new Set((store.validation_results?.activeManifest?.[k] || []).map(x => x.code))].sort()]));
await init({ module_or_path: await readFile(new URL('c2pa_bg.wasm', vendor)) });

test('real SDK Context serializes offline production anchors and never trusts the test signer', async () => {
  const anchors = await readFile(new URL('C2PA-TRUST-LIST.pem', vendor), 'utf8');
  const tsa = await readFile(new URL('C2PA-TSA-TRUST-LIST.pem', vendor), 'utf8');
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = () => assert.fail('offline Context must not fetch any trust resources');
  let reader;
  try {
    const serialized = await new Context({ verify: { ...VERIFY_SETTINGS }, trust: { trustAnchors: anchors }, tsaTrust: { trustAnchors: tsa } }).toJson();
    const settings = JSON.parse(serialized);
    assert.equal(settings.verify.remote_manifest_fetch, false); assert.equal(settings.verify.ocsp_fetch, false);
    reader = await WasmReader.fromBytes('image/png', await fixture('signed.png'), serialized);
    assert.equal(classifyC2pa({ kind: 'manifest', store: reader.manifestStore() }).status, 'untrusted_signer');
  } finally { reader?.free(); globalThis.fetch = fetchBefore; }
});

test('vendor hashes and the complete one-line same-extension worker patch are reproducible', async () => {
  const hashes = JSON.parse(await readFile(new URL('SHA256SUMS.json', vendor), 'utf8'));
  for (const [name, expected] of Object.entries(hashes)) assert.equal(createHash('sha256').update(await readFile(new URL(name, vendor))).digest('hex'), expected, name);
  const original = await readFile(new URL('builder.upstream.js', vendor), 'utf8');
  const patched = await readFile(new URL('builder.patched.js', vendor), 'utf8');
  assert.equal(patched, original.replace('if (r.protocol !== "https:")', 'if (r.protocol !== "https:" && !(r.protocol === "chrome-extension:" && globalThis.location?.protocol === "chrome-extension:" && r.host === globalThis.location.host))'));
  const body = patched.match(/function H\(r\) \{[\s\S]*?\n\}/)[0];
  const validate = vm.runInNewContext(`(${body})`, { globalThis: { location: { protocol: 'chrome-extension:', host: 'current' } } });
  assert.equal(validate(new URL('chrome-extension://current/worker.js')), 'chrome-extension://current/worker.js');
  for (const url of ['chrome-extension://other/worker.js', 'http://example.com/w.js', 'blob:https://example.com/w', 'file:///worker.js']) assert.throws(() => validate(new URL(url)));
  assert.equal(validate(new URL('https://example.com/w.js')), 'https://example.com/w.js');
});

for (const mode of ['untrusted', 'test-trusted']) {
  for (const name of ['signed', 'untrusted', 'corrupted-signature', 'binding-mismatch']) {
    test(`real WASM and c2patool agree: ${name}, ${mode}`, async () => {
      const anchors = mode === 'test-trusted' ? await fixture('test-root-A.crt') : null;
      const fetchBefore = globalThis.fetch;
      globalThis.fetch = () => assert.fail('WASM verification must not fetch');
      let reader;
      try {
        reader = await WasmReader.fromBytes('image/png', await fixture(`${name}.png`), JSON.stringify({ verify: { verify_trust: true, verify_after_reading: true, remote_manifest_fetch: false, ocsp_fetch: false }, trust: anchors ? { trust_anchors: anchors.toString() } : {} }));
        const actual = reader.manifestStore();
        const cli = await json(`${name}.c2patool-${mode}.json`);
        assert.equal(actual.validation_state, cli.validation_state);
        assert.deepEqual(codes(actual), codes(cli));
        const expected = await json(`${name}.png.expected.json`);
        assert.equal(classifyC2pa({ kind: 'manifest', store: actual }).status, mode === 'test-trusted' && name === 'signed' ? 'verified' : expected.status);
        if (name !== 'binding-mismatch') {
          const recorded = await json(`${name}.sdk-${mode}.json`);
          assert.equal(actual.active_manifest, recorded.active_manifest);
          assert.deepEqual(codes(actual), codes(recorded));
        }
      } finally { reader?.free(); globalThis.fetch = fetchBefore; }
    });
  }
}

test('real WASM rejects malformed file and reports no credentials for a stripped JPEG', async () => {
  await assert.rejects(WasmReader.fromBytes('image/png', await fixture('truncated.png')), error => { assert.equal(sdkReadError(error).kind, 'invalid'); return true; });
  await assert.rejects(WasmReader.fromBytes('image/jpeg', await fixture('stripped.jpg')), error => { assert.equal(sdkReadError(error).kind, 'no_credentials'); return true; });
});

test('classification requires affirmative crypto, binding and trust evidence; invalid takes precedence', async () => {
  const pristine = await json('signed.sdk-test-trusted.json');
  for (const code of ['claimSignature.validated', 'assertion.dataHash.match', 'signingCredential.trusted']) {
    const store = structuredClone(pristine);
    store.validation_results.activeManifest.success = store.validation_results.activeManifest.success.filter(x => x.code !== code);
    assert.equal(classifyC2pa({ kind: 'manifest', store }).status, 'unavailable');
  }
  for (const code of ['claimSignature.mismatch', 'assertion.dataHash.mismatch', 'signingCredential.expired', 'claimSignature.outsideValidity', 'signingCredential.invalid', 'future.failure']) {
    const store = structuredClone(pristine); // synthetic failure branches, not fixture evidence
    store.validation_results.activeManifest.failure.push({ code });
    const result = classifyC2pa({ kind: 'manifest', store });
    assert.equal(result.status, 'invalid'); assert.ok(result.reasons.includes(code));
  }
  assert.equal(classifyC2pa({ kind: 'manifest', store: {} }).status, 'unavailable');
  assert.equal(classifyC2pa({ kind: 'unavailable' }).status, 'unavailable');
});

test('adapter uses packaged URLs, offline settings, separate trust stores, and always disposes', async () => {
  let disposed = 0, settings;
  const store = await json('signed.sdk-test-trusted.json');
  const outcome = await verifyC2pa(new Uint8Array([1]), 'image/png', {
    getURL: path => 'chrome-extension://current/' + path,
    fetchPackaged: async url => { assert.ok(url.startsWith('chrome-extension://current/')); return new Response('test anchors'); },
    loadSdk: async () => ({
      createC2pa: async options => { assert.equal(options.workerSrc.href, 'chrome-extension://current/frontend/provenance/c2pa-worker.js'); assert.ok(options.wasmSrc.startsWith('chrome-extension://current/')); return { dispose() { disposed++; } }; },
      Context: class { constructor(value) { settings = value; } },
      Reader: { fromBlob: async (_instance, format, blob) => { assert.equal(format, 'image/png'); assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [1]); return { manifestStore: async () => store }; } }
    })
  });
  assert.equal(outcome.kind, 'manifest'); assert.equal(disposed, 1);
  assert.deepEqual(settings.verify, VERIFY_SETTINGS); assert.equal(settings.trust.trustAnchors, 'test anchors'); assert.equal(settings.tsaTrust.trustAnchors, 'test anchors');
});

test('browser SDK null reader means no credentials, including JPEGs deferred to the SDK', async () => {
  const anchors = (await fixture('test-root-A.crt')).toString();
  const bytes = await fixture('stripped.jpg');
  let disposed = 0, calls = 0;
  const options = {
    getURL: path => 'chrome-extension://current/' + path,
    fetchPackaged: async () => new Response(anchors),
    loadSdk: async () => ({ Context, Reader, createC2pa: async () => ({
      worker: { tx: { reader_fromBlob: async (format, blob, settings) => {
        calls++;
        try { const reader = await WasmReader.fromBytes(format, new Uint8Array(await blob.arrayBuffer()), settings); reader.free(); assert.fail('unsigned file must not have a manifest'); }
        catch (error) { throw new Error(String(error)); } // Same string-to-Error transport as the upstream worker.
      } } }, dispose() { disposed++; }
    }) })
  };
  // Uses the actual public Reader class, which converts JumbfNotFound to null.
  const outcome = await verifyC2pa(bytes, 'image/jpeg', options);
  assert.equal(outcome.kind, 'no_credentials');
  assert.equal(calls, 1); assert.equal(disposed, 1);
  const large = await fixture('large-stripped.jpg');
  assert.equal((await readMetadata(large)).marker, 'unknown');
  const result = await checkProvenance(`data:image/jpeg;base64,${large.toString('base64')}`, {
    verify: (image, format, config) => verifyC2pa(image, format, { ...options, ...config })
  });
  assert.equal(result.status, 'no_credentials');
  assert.equal(result.signatureStatus, 'absent'); assert.equal(result.metadataInspected, true);
  assert.equal(calls, 2); assert.equal(disposed, 2);
});

test('load errors, timeouts, aborts and unknown SDK errors become unavailable', async () => {
  const options = { getURL: path => 'chrome-extension://current/' + path, fetchPackaged: async () => new Response('anchors') };
  assert.equal((await verifyC2pa(new Uint8Array(), 'image/png', { ...options, loadSdk: async () => { throw new Error('CSP'); } })).kind, 'unavailable');
  assert.equal((await verifyC2pa(new Uint8Array(), 'image/png', { ...options, timeoutMs: 5, loadSdk: () => new Promise(() => {}) })).kind, 'unavailable');
  const controller = new AbortController(); controller.abort();
  assert.equal((await verifyC2pa(new Uint8Array(), 'image/png', { signal: controller.signal })).kind, 'unavailable');
  assert.equal(sdkReadError(new Error('unexpected runtime failure')).kind, 'unavailable');
});

test('failure diagnostics identify load, trust, initialization, read and timeout stages without exposing raw errors', async () => {
  const privateText = 'https://private.example/image?token=secret <img onerror=alert(1)> prompt';
  const base = { getURL: path => 'chrome-extension://current/' + path, fetchPackaged: async () => new Response('test anchors') };
  const loadError = await verifyC2pa(new Uint8Array(), 'image/jpeg', { ...base, loadSdk: async () => { throw new Error(privateText); } });
  assert.equal(loadError.diagnosticCode, 'sdk_load_failed');
  const trustError = await verifyC2pa(new Uint8Array(), 'image/jpeg', { ...base, loadSdk: async () => ({}), fetchPackaged: async () => new Response('denied', { status: 404 }) });
  assert.equal(trustError.diagnosticCode, 'trust_anchors_unavailable');
  const initError = await verifyC2pa(new Uint8Array(), 'image/jpeg', { ...base, loadSdk: async () => ({ createC2pa: async () => { throw new Error(privateText); } }) });
  assert.equal(initError.diagnosticCode, 'sdk_initialization_failed');
  const timeout = await verifyC2pa(new Uint8Array(), 'image/jpeg', { ...base, timeoutMs: 5, loadSdk: () => new Promise(() => {}) });
  assert.equal(timeout.diagnosticCode, 'verifier_timeout');
  const undefinedReader = await verifyC2pa(new Uint8Array(), 'image/jpeg', { ...base, loadSdk: async () => ({ createC2pa: async () => ({ dispose() {} }), Context: class {}, Reader: { fromBlob: async () => undefined } }) });
  assert.equal(undefinedReader.kind, 'unavailable'); // Only the SDK's explicit null means absence.
  for (const failure of [loadError, trustError, initError, timeout, undefinedReader, sdkReadError(new Error(privateText))]) {
    const result = classifyC2pa(failure);
    assert.equal(result.status, 'unavailable'); assert.ok(result.diagnosticCode);
    assert.deepEqual(result.reasons, []); assert.ok(!JSON.stringify(result).includes('secret')); assert.ok(!JSON.stringify(result).includes('<img'));
  }
  assert.equal(unavailableResult(privateText).diagnosticCode, 'check_failed');
  const denied = await checkProvenance('unused', { acquire: async () => { throw new Error(privateText); } });
  assert.equal(denied.diagnosticCode, 'bytes_unavailable'); assert.equal(denied.metadataInspected, false);
  assert.ok(denied.message.includes('Upload the original'));
  const sdkFailure = await checkProvenance('unused', { acquire: async () => ({ bytes: await fixture('signed.png') }), verify: async () => initError });
  assert.equal(sdkFailure.diagnosticCode, 'sdk_initialization_failed'); assert.equal(sdkFailure.metadataInspected, true);
});

test('orchestration skips WASM only for clear marker absence and keeps hints unsigned', async () => {
  for (const name of ['stable-diffusion.png', 'stripped.jpg']) {
    const result = await checkProvenance('unused', { acquire: async () => ({ bytes: await fixture(name) }), verify: () => assert.fail('must stay lazy') });
    assert.equal(result.status, 'no_credentials'); assert.equal(result.signatureStatus, 'absent');
  }
  let called = 0;
  const malformed = await checkProvenance('unused', { acquire: async () => ({ bytes: await fixture('truncated.png') }), verify: async () => { called++; return { kind: 'invalid' }; } });
  assert.equal(called, 1); assert.equal(malformed.status, 'invalid');
  assert.equal((await checkProvenance('unused', { acquire: async () => ({ bytes: Buffer.from('GIF89a') }) })).status, 'unsupported_format');
  assert.equal((await checkProvenance('unused', { acquire: async () => { throw new Error('denied'); } })).status, 'unavailable');
});
