import { neutralizeWorkerNetwork, loadWorkerSdk } from './worker-network.js';
// Dynamic import neutralizes APIs BEFORE SDK execution.
export const networkAttempts = neutralizeWorkerNetwork(globalThis);
export const ready = loadWorkerSdk(globalThis, () => import('./vendor/c2pa/c2pa_worker.js'));
