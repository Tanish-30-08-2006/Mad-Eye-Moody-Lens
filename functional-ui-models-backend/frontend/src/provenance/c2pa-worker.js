import { neutralizeWorkerNetwork, loadWorkerSdk } from './worker-network.js';
export const networkAttempts = neutralizeWorkerNetwork(globalThis);
globalThis.addEventListener('message', async event => {
  if (event.data?.control !== 'compile-wasm') return;
  event.stopImmediatePropagation();
  try {
    const module = await WebAssembly.compile(event.data.bytes);
    globalThis.postMessage({ control: 'compiled-wasm', module });
  } catch { globalThis.postMessage({ control: 'compiled-wasm', error: true }); }
});
export const ready = loadWorkerSdk(globalThis, () => import('./vendor/c2pa_worker.js'));
