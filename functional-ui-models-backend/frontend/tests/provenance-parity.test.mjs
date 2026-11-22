import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import * as extReader from '../../../Browser_Extension/frontend/provenance/metadata-reader.js';
import * as webReader from '../src/provenance/metadata-reader.js';
import * as extCore from '../../../Browser_Extension/frontend/provenance/provenance-core.js';
import * as webCore from '../src/provenance/provenance-core.js';
import { extractDeclarations as extDeclarations } from '../../../Browser_Extension/frontend/provenance/declarations.js';
import { extractDeclarations as webDeclarations } from '../src/provenance/declarations.js';
import { sdkReadError } from '../../../Browser_Extension/frontend/provenance/c2pa-verifier.js';
import { createOfflineContext } from '../../../Browser_Extension/frontend/provenance/offline-settings.js';
import * as sdk from '../../../Browser_Extension/frontend/provenance/vendor/c2pa/sdk.js';
import init, { WasmReader } from '../../../Browser_Extension/frontend/provenance/vendor/c2pa/wasm-bindings.js';

const extension = new URL('../../../Browser_Extension/frontend/provenance/', import.meta.url);
const website = new URL('../src/provenance/', import.meta.url);
const fixtures = new URL('../../../Browser_Extension/backend/tests/fixtures/provenance/', import.meta.url);
await init({ module_or_path: await readFile(new URL('vendor/c2pa/c2pa_bg.wasm', extension)) });
const settings = await createOfflineContext(sdk, await readFile(new URL('vendor/c2pa/C2PA-TRUST-LIST.pem', extension), 'utf8'), await readFile(new URL('vendor/c2pa/C2PA-TSA-TRUST-LIST.pem', extension), 'utf8')).toJson();

test('documented pure logic copies are byte-identical and both SDK pins match', async () => {
  for (const name of ['bytes.js', 'metadata-reader.js', 'declarations.js', 'provenance-core.js', 'evidence.js', 'offline-settings.js', 'worker-network.js']) assert.deepEqual(await readFile(new URL(name, extension)), await readFile(new URL(name, website)), name);
  const locked = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url)));
  const version = JSON.parse(await readFile(new URL('vendor/VERSION.json', website)));
  assert.equal(version.version, '0.16.0'); assert.equal(version.integrity, locked.packages['node_modules/@contentauth/c2pa-web'].integrity);
  assert.deepEqual(await readFile(new URL('vendor/c2pa_worker.js', website)), await readFile(new URL('vendor/c2pa/c2pa_worker.js', extension)));
});
for (const name of (await readdir(fixtures)).filter(name => /\.(png|jpe?g|webp)$/i.test(name))) test(`extension/website JSON parity: ${name}`, async () => {
  const bytes = await readFile(new URL(name, fixtures));
  const metadata = await extReader.readMetadata(bytes);
  assert.deepEqual(await webReader.readMetadata(bytes), metadata);
  let outcome = { kind: 'no_credentials' };
  if (metadata.format && metadata.marker !== 'absent') {
    let reader;
    try { reader = await WasmReader.fromBytes(metadata.format, bytes, settings); outcome = { kind: 'manifest', store: reader.manifestStore() }; }
    catch (error) { outcome = sdkReadError(error); }
    finally { reader?.free(); }
  }
  assert.deepEqual(webDeclarations(outcome.store), extDeclarations(outcome.store));
  assert.deepEqual(webCore.classifyC2pa(outcome), extCore.classifyC2pa(outcome));
  const options = { acquire: async () => ({ bytes }), verify: async () => outcome, sourceHostHints: false };
  assert.deepEqual(await webCore.checkProvenance('fixture', options), await extCore.checkProvenance('fixture', options));
});
