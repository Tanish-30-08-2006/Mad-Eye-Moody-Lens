import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import init, { WasmReader } from '../../frontend/provenance/vendor/c2pa/wasm-bindings.js';
import { Context } from '../../frontend/provenance/vendor/c2pa/sdk.js';
import { verifyC2pa, VERIFY_SETTINGS, sdkReadError } from '../../frontend/provenance/c2pa-verifier.js';
import { checkProvenance, classifyC2pa } from '../../frontend/provenance/provenance-core.js';

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

test('load errors, timeouts, aborts and unknown SDK errors become unavailable', async () => {
  const options = { getURL: path => 'chrome-extension://current/' + path, fetchPackaged: async () => new Response('anchors') };
  assert.equal((await verifyC2pa(new Uint8Array(), 'image/png', { ...options, loadSdk: async () => { throw new Error('CSP'); } })).kind, 'unavailable');
  assert.equal((await verifyC2pa(new Uint8Array(), 'image/png', { ...options, timeoutMs: 5, loadSdk: () => new Promise(() => {}) })).kind, 'unavailable');
  const controller = new AbortController(); controller.abort();
  assert.equal((await verifyC2pa(new Uint8Array(), 'image/png', { signal: controller.signal })).kind, 'unavailable');
  assert.equal(sdkReadError(new Error('unexpected runtime failure')).kind, 'unavailable');
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
