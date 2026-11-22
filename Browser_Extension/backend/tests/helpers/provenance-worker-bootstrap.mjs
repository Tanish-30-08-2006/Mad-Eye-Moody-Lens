// Node transport shim only. The production worker and actual SDK/WASM run unchanged.
import { parentPort, workerData } from 'node:worker_threads';
globalThis.self = globalThis;
// FileReaderSync is native in browser workers but absent from Node. Preserve the
// actual Blob bytes/slices in a test-only synchronous reader, not a crypto mock.
const buffers = new WeakMap(), nativeSlice = Blob.prototype.slice;
Blob.prototype.slice = function (start = 0, end = this.size, type) {
  const part = nativeSlice.call(this, start, end, type), bytes = buffers.get(this);
  const bound = n => n < 0 ? Math.max(this.size + n, 0) : Math.min(n, this.size);
  if (bytes) buffers.set(part, bytes.slice(bound(start), Math.max(bound(start), bound(end))));
  return part;
};
globalThis.FileReaderSync = class {
  readAsArrayBuffer(blob) { const bytes = buffers.get(blob); if (!bytes) throw new Error('Unprepared test Blob'); return bytes.slice(0); }
};
globalThis.addEventListener = (name, callback) => {
  if (name === 'message') parentPort.on('message', async data => {
    for (const value of data.args || []) if (value instanceof Blob) buffers.set(value, await value.arrayBuffer());
    callback({ data });
  });
};
globalThis.postMessage = (message, options) => parentPort.postMessage(message, options?.transfer || []);
const { networkAttempts } = await import(workerData.entry);
parentPort.on('message', data => {
  if (data.control === 'counts') parentPort.postMessage({ control: 'counts', counts: { ...networkAttempts } });
  if (data.control === 'probe') {
    for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts']) { try { globalThis[name]('https://never.invalid'); } catch {} }
    try { navigator.sendBeacon('https://never.invalid'); } catch {}
    parentPort.postMessage({ control: 'probe', counts: { ...networkAttempts } });
    for (const name of Object.keys(networkAttempts)) networkAttempts[name] = 0;
  }
});
parentPort.postMessage({ control: 'ready' });
