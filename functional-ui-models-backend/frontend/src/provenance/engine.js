// Original File bytes only. No detector call, canvas, persistence or filename log.
import { checkProvenance, unavailableResult } from './provenance-core.js';
import { MAX_BYTES, AcquisitionError } from './bytes.js';
export async function checkFile(file, { signal, verify } = {}) {
  return checkProvenance(file, { signal, verify, sourceHostHints: false, acquire: async () => {
    if (signal?.aborted) throw new AcquisitionError('Cancelled', 'check_cancelled');
    if (file.size > MAX_BYTES) throw new AcquisitionError('Too large', 'size_limit_exceeded');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new AcquisitionError('Too large', 'size_limit_exceeded');
    if (signal?.aborted) throw new AcquisitionError('Cancelled', 'check_cancelled');
    return { bytes };
  } });
}
export function createSelectionRunner(check, emit) {
  let generation = 0, controller, disposed = false;
  return {
    async run(file) {
      if (disposed) return;
      const ticket = ++generation; controller?.abort(); controller = new AbortController();
      emit({ file, checking: Boolean(file), result: null });
      if (!file) return;
      let result;
      try { result = await check(file, { signal: controller.signal }); } catch { result = unavailableResult(); }
      if (!disposed && ticket === generation) emit({ file, checking: false, result });
    },
    dispose() { disposed = true; generation++; controller?.abort(); }
  };
}
