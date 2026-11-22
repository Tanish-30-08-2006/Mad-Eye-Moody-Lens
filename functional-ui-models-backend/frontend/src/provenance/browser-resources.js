import { channel } from 'highgain';
import wasm from '@contentauth/c2pa-web/resources/c2pa.wasm?url';
import worker from './c2pa-worker.js?worker&url';
import anchors from './vendor/C2PA-TRUST-LIST.pem?raw';
import tsa from './vendor/C2PA-TSA-TRUST-LIST.pem?raw';
export const options = {
  async loadSdk() {
    const sdk = await import('./vendor/sdk.js');
    return { ...sdk, createC2pa: createReaderWorker };
  },
  getURL(path) {
    if (path.endsWith('/C2PA-TRUST-LIST.pem')) return 'offline:manifest';
    if (path.endsWith('/C2PA-TSA-TRUST-LIST.pem')) return 'offline:tsa';
    if (path.endsWith('/c2pa_bg.wasm')) return new URL(wasm, location.href).href;
    if (path.endsWith('/c2pa-worker.js')) return new URL(worker, location.href).href;
    throw new Error('Unknown packaged resource');
  },
  async fetchPackaged(url) {
    if (url === 'offline:manifest') return new Response(anchors);
    if (url === 'offline:tsa') return new Response(tsa);
    throw new Error('Trust resource fetching is disabled');
  }
};

// Compile WASM in the guarded external worker, avoiding main-thread WASM eval
// under the existing site CSP. This reuses the official SDK's highgain protocol
// and public Reader/Context; no parsing or cryptography is reimplemented.
async function createReaderWorker({ wasmSrc, workerSrc }) {
  const base = location.origin;
  if (new URL(wasmSrc).origin !== base || workerSrc.origin !== base) throw new Error('Only same-origin resources are allowed');
  const response = await fetch(wasmSrc, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Packaged WASM unavailable');
  const bytes = await response.arrayBuffer();
  const instance = new Worker(workerSrc, { type: 'module' });
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Worker startup timed out')), 10000); });
  try {
    const compiled = new Promise((resolve, reject) => {
      instance.addEventListener('error', () => reject(new Error('Worker startup failed')), { once: true });
      const receive = event => {
        if (event.data?.control !== 'compiled-wasm') return;
        instance.removeEventListener('message', receive);
        event.data.error ? reject(new Error('WASM initialization failed')) : resolve(event.data.module);
      };
      instance.addEventListener('message', receive);
    });
    const tx = channel().createTx(instance);
    instance.postMessage({ control: 'compile-wasm', bytes }, [bytes]);
    await Promise.race([(async () => { await tx.initWorker(await compiled); })(), deadline]);
    return { worker: { tx }, dispose() { instance.terminate(); } };
  } catch (error) { instance.terminate(); throw error; }
  finally { clearTimeout(timer); }
}
