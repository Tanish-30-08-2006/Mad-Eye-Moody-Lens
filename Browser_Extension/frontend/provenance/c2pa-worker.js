import { neutralizeWorkerNetwork } from './worker-network.js';
// Dynamic import neutralizes APIs BEFORE SDK execution.
export const networkAttempts = neutralizeWorkerNetwork(globalThis);
await import('./vendor/c2pa/c2pa_worker.js');
