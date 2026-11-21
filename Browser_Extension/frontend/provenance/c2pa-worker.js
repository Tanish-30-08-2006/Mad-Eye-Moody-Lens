// The upstream worker is packaged. Its readers cannot make any network request.
import './vendor/c2pa/c2pa_worker.js';
globalThis.fetch = () => Promise.reject(new Error('Network access is disabled in the provenance verifier.'));
globalThis.XMLHttpRequest = undefined;
globalThis.WebSocket = undefined;
