import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
import init, { WasmReader } from '../../frontend/provenance/vendor/c2pa/wasm-bindings.js';
import { readMetadata } from '../../frontend/provenance/metadata-reader.js';
import { checkProvenance, STATUS_LABELS } from '../../frontend/provenance/provenance-core.js';
import { sdkReadError } from '../../frontend/provenance/c2pa-verifier.js';
import { MAX_BYTES, AcquisitionError } from '../../frontend/provenance/bytes.js';

const fixtures = new URL('./fixtures/provenance/', import.meta.url);
await init({ module_or_path: await readFile(new URL('../../frontend/provenance/vendor/c2pa/c2pa_bg.wasm', import.meta.url)) });
const verify = async (bytes, format) => {
  let reader;
  try { reader = await WasmReader.fromBytes(format, bytes, JSON.stringify({ verify: { verify_trust: true, verify_after_reading: true, remote_manifest_fetch: false, ocsp_fetch: false } })); return { kind: 'manifest', store: reader.manifestStore() }; }
  catch (error) { return sdkReadError(error); }
  finally { reader?.free(); }
};

for (const name of ['self-signed.png', 'reencoded.webp', 'reencoded.jpg', 'remote-manifest.jpg', 'expired-chatgpt.png', 'truncated.png']) test(`real fixture matrix: ${name}`, async () => {
  const bytes = await readFile(new URL(name, fixtures)), expected = JSON.parse(await readFile(new URL(name + '.expected.json', fixtures)));
  const metadata = await readMetadata(bytes);
  const result = await checkProvenance('fixture', { acquire: async () => ({ bytes }), verify });
  assert.equal(metadata.format, expected.format); assert.equal(metadata.marker, expected.marker);
  assert.equal(result.status, expected.status);
  if ('reasonCode' in expected) assert.equal(result.reasonCode, expected.reasonCode);
  if ('diagnosticCode' in expected) assert.equal(result.diagnosticCode, expected.diagnosticCode);
  if (name === 'self-signed.png') {
    const cert = new X509Certificate(await readFile(new URL('self-signed-test.crt', fixtures)));
    assert.equal(cert.subject, cert.issuer); assert.equal(cert.verify(cert.publicKey), true);
    assert.equal(result.certificateType, 'not_established', 'the SDK does not expose enough certificate detail to label arbitrary signers');
    assert.notEqual(result.status, 'invalid');
  }
});

const originals = new URL('./fixtures/real-world/', import.meta.url);
const local = (await readdir(originals)).filter(name => /\.(png|jpe?g|webp|gif|avif)$/i.test(name)).sort();
if (!local.length) test('local ChatGPT/Gemini originals compatibility', { skip: 'No local originals supplied; real-world compatibility is unverified' }, () => {});
for (let i = 0; i < local.length; i++) test(`local original ${i + 1} (private filename not logged)`, async t => {
  const path = new URL(local[i], originals), info = await stat(path);
  const result = await checkProvenance('local-original', { acquire: async () => { if (info.size > MAX_BYTES) throw new AcquisitionError('Too large', 'size_limit_exceeded'); return { bytes: await readFile(path) }; }, verify });
  assert.ok(Object.hasOwn(STATUS_LABELS, result.status));
  t.diagnostic(`Status: ${result.status}; diagnostic: ${result.diagnosticCode || result.reasonCode || 'none'}`);
});
