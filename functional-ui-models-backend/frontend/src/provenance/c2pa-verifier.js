import { verifyC2pa as verifyPackaged } from './verifier-adapter.js';
export async function verifyC2pa(bytes, format, config = {}) {
  try {
    const { options } = await import('./browser-resources.js');
    return await verifyPackaged(bytes, format, { ...options, ...config });
  } catch { return { kind: 'unavailable', diagnosticCode: 'sdk_load_failed' }; }
}
