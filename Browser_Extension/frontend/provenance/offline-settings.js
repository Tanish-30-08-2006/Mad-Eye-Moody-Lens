// Trust inputs must be inline, never URLs. Resource startup precedes verification.
export const OFFLINE_POLICY = Object.freeze({ trustListFetch: false, timestampTrustFetch: false, remoteManifestFetch: false, ocspFetch: false });
export const VERIFY_SETTINGS = Object.freeze({ verifyTrust: true, verifyAfterReading: true, verifyTimestampTrust: true, remoteManifestFetch: false, ocspFetch: false });
const isUrl = value => { try { new URL(value.trim()); return true; } catch { return false; } };

export function createOfflineContext(sdk, anchors, tsaAnchors) {
  if ([anchors, tsaAnchors].some(value => typeof value !== 'string' || !value.trim() || isUrl(value))) throw new Error('Offline trust resources must be inline text.');
  return new class extends sdk.Context {
    constructor() { super({ verify: { ...VERIFY_SETTINGS }, trust: { trustAnchors: anchors, verifyTrustList: true }, tsaTrust: { trustAnchors: tsaAnchors } }); }
    get networkPolicy() { return OFFLINE_POLICY; }
    async toJson() {
      const wire = JSON.parse(await super.toJson({ fetch: () => { throw new Error('Trust resource fetching is disabled.'); }, maxRetries: 0 }));
      // utilities 0.4.0 lacks the tsaTrust convenience mapping. Use native anchors
      // without mixing timestamp and manifest roots; the real WASM tests check it.
      delete wire.tsa_trust;
      wire.trust.anchors.push({ trust_kind: 'tsa', trust_uri: 'offline_tsa_anchors', trust_anchors: tsaAnchors });
      return JSON.stringify(wire);
    }
  }();
}
