// Thin, injectable adapter. Only the SDK validates cryptography and asset bindings.
export const VERIFIER_TIMEOUT_MS = 15000;
export const VERIFY_SETTINGS = Object.freeze({ verifyTrust: true, verifyAfterReading: true, verifyTimestampTrust: true, remoteManifestFetch: false, ocspFetch: false });

export function sdkReadError(error) {
  const message = typeof error === 'string' ? error : error?.message || '';
  if (/^C2pa\(JumbfNotFound\)/.test(message)) return { kind: 'no_credentials' };
  if (/^C2pa\(UnsupportedType\b/.test(message)) return { kind: 'unsupported_format' };
  if (/^C2pa\((?:InvalidAsset|InvalidClaim|CoseSignature|ClaimDecoding|JumbfParseError)\b/.test(message)) return { kind: 'invalid', reasons: [] };
  return { kind: 'unavailable' };
}

export async function verifyC2pa(bytes, format, {
  signal, timeoutMs = VERIFIER_TIMEOUT_MS,
  loadSdk = () => import('./vendor/c2pa/sdk.js'),
  getURL = path => chrome.runtime.getURL(path),
  fetchPackaged = globalThis.fetch
} = {}) {
  let instance, reader, abandoned = false, timer;
  let onAbort;
  const operation = async () => {
    const base = 'frontend/provenance/vendor/c2pa/';
    const [sdk, anchors, tsaAnchors] = await Promise.all([
      loadSdk(),
      fetchPackaged(getURL(base + 'C2PA-TRUST-LIST.pem'), { signal, credentials: 'omit' }).then(r => { if (!r.ok) throw new Error(); return r.text(); }),
      fetchPackaged(getURL(base + 'C2PA-TSA-TRUST-LIST.pem'), { signal, credentials: 'omit' }).then(r => { if (!r.ok) throw new Error(); return r.text(); })
    ]);
    if (abandoned) throw new Error();
    instance = await sdk.createC2pa({
      wasmSrc: getURL(base + 'c2pa_bg.wasm'),
      workerSrc: new URL(getURL('frontend/provenance/c2pa-worker.js'))
    });
    if (abandoned) { instance.dispose(); throw new Error(); }
    const context = new sdk.Context({ verify: { ...VERIFY_SETTINGS }, trust: { trustAnchors: anchors }, tsaTrust: { trustAnchors: tsaAnchors } });
    try {
      reader = await sdk.Reader.fromBlob(instance, format, new Blob([bytes], { type: format }), context);
      if (abandoned) return { kind: 'unavailable' };
      return { kind: 'manifest', store: await reader.manifestStore() };
    } catch (error) { return sdkReadError(error); }
  };
  try {
    if (signal?.aborted) return { kind: 'unavailable' };
    const deadline = new Promise(resolve => {
      onAbort = () => { abandoned = true; instance?.dispose(); resolve({ kind: 'unavailable' }); };
      signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(onAbort, timeoutMs);
    });
    return await Promise.race([operation(), deadline]);
  } catch { return { kind: 'unavailable' }; }
  finally {
    abandoned = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    // Termination releases all manifest/image memory, including pending reader operations.
    instance?.dispose();
  }
}
