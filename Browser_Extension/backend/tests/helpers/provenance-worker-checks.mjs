import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';

export async function offlineWorkerCheck({ sdk, createOfflineContext, entry, vendor }) {
  const fixture = name => readFile(new URL(`../fixtures/provenance/${name}`, import.meta.url));
  const module = await WebAssembly.compile(await readFile(new URL('c2pa_bg.wasm', vendor)));
  const anchors = await readFile(new URL('C2PA-TRUST-LIST.pem', vendor), 'utf8');
  const tsa = await readFile(new URL('C2PA-TSA-TRUST-LIST.pem', vendor), 'utf8');
  const bytes = await Promise.all(['remote-manifest.jpg', 'signed.png', 'expired-chatgpt.png'].map(fixture));
  const saved = [], calls = [];
  const spy = name => function () { calls.push(name); assert.fail(`Unexpected parent network call: ${name}`); };
  const replace = (object, name, value) => { saved.push([object, name, Object.getOwnPropertyDescriptor(object, name)]); Object.defineProperty(object, name, { value, configurable: true, writable: true }); };
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts']) replace(globalThis, name, spy(name));
  if (!globalThis.navigator) replace(globalThis, 'navigator', {});
  replace(navigator, 'sendBeacon', spy('sendBeacon'));
  const worker = new Worker(new URL('./provenance-worker-bootstrap.mjs', import.meta.url), { workerData: { entry: entry.href } });
  let id = 0;
  const pending = new Map();
  worker.on('message', message => {
    const key = message.control || message.id;
    const request = pending.get(key);
    if (request) { clearTimeout(request.timer); pending.delete(key); message.error ? request.reject(message.error) : request.resolve(message.control ? message : message.result); }
  });
  worker.on('error', error => { for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); } pending.clear(); });
  const wait = key => new Promise((resolve, reject) => { pending.set(key, { resolve, reject, timer: setTimeout(() => { pending.delete(key); reject(new Error(`Worker timed out: ${key}`)); }, 8000) }); });
  const tx = new Proxy({}, { get: (_, method) => (...args) => { const ticket = ++id, response = wait(ticket); worker.postMessage({ id: ticket, method, args, channelName: 'default' }); return response; } });
  const control = name => { const response = wait(name); worker.postMessage({ control: name }); return response; };
  try {
    await wait('ready');
    const probe = await control('probe');
    assert.deepEqual(Object.values(probe.counts), [1, 1, 1, 1, 1], 'each failing worker spy must be installed');
    await tx.initWorker(module);
    const context = createOfflineContext(sdk, anchors, tsa);
    assert.deepEqual(context.networkPolicy, { trustListFetch: false, timestampTrustFetch: false, remoteManifestFetch: false, ocspFetch: false });
    const effective = JSON.parse(await context.toJson());
    assert.equal(effective.verify.remote_manifest_fetch, false);
    assert.equal(effective.verify.ocsp_fetch, false);
    assert.equal(effective.verify.verify_trust, true);
    assert.equal(effective.verify.verify_timestamp_trust, true);
    assert.deepEqual(effective.trust.anchors.map(item => item.trust_kind), ['manifest', 'tsa']);
    assert.equal(effective.trust.anchors[0].trust_anchors, anchors);
    assert.equal(effective.trust.anchors[1].trust_anchors, tsa);
    assert.equal(effective.tsa_trust, undefined);
    for (const url of ['https://never.invalid/anchors', 'data:text/plain,anchors']) assert.throws(() => createOfflineContext(sdk, url, tsa));
    const instance = { worker: { tx } }, stores = [];
    for (let i = 0; i < bytes.length; i++) {
      const format = i === 0 ? 'image/jpeg' : 'image/png';
      if (i === 0) {
        // With fetching disabled, this SDK explicitly refuses a remote-only
        // manifest. It does not return the null used for ordinary unsigned files.
        await assert.rejects(sdk.Reader.fromBlob(instance, format, new Blob([bytes[i]], { type: format }), context), /C2pa\(RemoteManifestUrl\(/);
        stores.push({ remoteManifestNotFetched: true });
        continue;
      }
      const reader = await sdk.Reader.fromBlob(instance, format, new Blob([bytes[i]], { type: format }), context);
      stores.push(reader ? await reader.manifestStore() : null);
      await reader?.free();
    }
    assert.equal(stores[0].remoteManifestNotFetched, true);
    assert.ok(stores[1].validation_results.activeManifest.failure.some(item => item.code === 'signingCredential.untrusted'));
    assert.ok(stores[2].validation_results.activeManifest.failure.some(item => item.code === 'signingCredential.expired'));
    assert.equal(stores[1].validation_results.specVersion, '2.4.0');
    assert.deepEqual(Object.values((await control('counts')).counts), [0, 0, 0, 0, 0]);
    assert.deepEqual(calls, []);
    return stores;
  } finally {
    await worker.terminate();
    for (const request of pending.values()) clearTimeout(request.timer);
    for (const [object, name, descriptor] of saved.reverse()) { if (descriptor) Object.defineProperty(object, name, descriptor); else delete object[name]; }
  }
}
