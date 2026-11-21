import { acquireBytes } from './bytes.js';
import { readMetadata } from './metadata-reader.js';
import { verifyC2pa } from './c2pa-verifier.js';

export const SCHEMA_VERSION = 1;
export const STATUS_LABELS = Object.freeze({ verified: 'Verified credentials', untrusted_signer: 'Unknown signer', invalid: 'Signature invalid', no_credentials: 'No credentials found', unsupported_format: 'Unsupported format', unavailable: 'Unavailable' });
const messages = Object.freeze({
  verified: 'Signature, file binding and signer trust were validated against the bundled trust snapshot.',
  untrusted_signer: 'The signature and file binding are valid; this signer is outside the bundled trust snapshot.',
  invalid: 'The SDK reported invalid credentials, an integrity failure, or a malformed credential container.',
  no_credentials: 'No embedded credentials found. Sharing platforms often strip file metadata.',
  unsupported_format: 'File credentials are checked for JPEG, PNG and WebP only.',
  unavailable: 'The check could not complete. Try Re-check or upload the original file instead.'
});

/** @typedef {'verified'|'untrusted_signer'|'invalid'|'no_credentials'|'unsupported_format'|'unavailable'} ProvenanceStatus */
/** @returns {{schemaVersion:number,status:ProvenanceStatus,signatureStatus:string,signerTrust:string,reasons:string[],signer:null|string,claimGenerator:null|string,claimedSigningTime:null|string,aiDeclaration:string,actions:object[],ingredientCount:number,metadataHints:object[],remoteManifestNotFetched:boolean,message:string}} */
export function makeResult(status) {
  return { schemaVersion: SCHEMA_VERSION, status, signatureStatus: status === 'verified' || status === 'untrusted_signer' ? 'valid' : status === 'invalid' ? 'invalid' : status === 'no_credentials' ? 'absent' : 'unknown', signerTrust: status === 'verified' ? 'trusted' : status === 'untrusted_signer' ? 'untrusted' : 'unknown', reasons: [], signer: null, claimGenerator: null, claimedSigningTime: null, aiDeclaration: 'not_declared', actions: [], ingredientCount: 0, metadataHints: [], remoteManifestNotFetched: false, message: messages[status] };
}

function codeList(items) { return Array.isArray(items) ? items.map(x => x?.code).filter(x => typeof x === 'string') : []; }
export function classifyC2pa(outcome) {
  if (outcome?.kind !== 'manifest') return makeResult(['no_credentials', 'invalid', 'unsupported_format'].includes(outcome?.kind) ? outcome.kind : 'unavailable');
  const store = outcome.store;
  const active = typeof store?.active_manifest === 'string' && store.manifests && Object.hasOwn(store.manifests, store.active_manifest) && store.manifests[store.active_manifest];
  const validation = store?.validation_results?.activeManifest;
  if (!active || !validation) return makeResult('unavailable');
  const success = codeList(validation.success), failures = codeList(validation.failure);
  const reasons = [...success, ...codeList(validation.informational), ...failures, ...codeList(store.validation_status)];
  for (const delta of (store.validation_results.ingredientDeltas || []).slice(0, 64)) {
    reasons.push(...codeList(delta.validationDeltas?.success), ...codeList(delta.validationDeltas?.informational), ...codeList(delta.validationDeltas?.failure));
  }
  const cryptoValid = success.includes('claimSignature.validated');
  const bindingValid = success.includes('assertion.dataHash.match');
  let status = 'unavailable';
  if (store.validation_state === 'Invalid' || failures.some(code => code !== 'signingCredential.untrusted')) status = 'invalid';
  else if (cryptoValid && bindingValid && store.validation_state === 'Trusted' && !failures.length && success.includes('signingCredential.trusted')) status = 'verified';
  else if (cryptoValid && bindingValid && store.validation_state === 'Valid' && failures.includes('signingCredential.untrusted')) status = 'untrusted_signer';
  const result = makeResult(status);
  result.reasons = [...new Set(reasons)].slice(0, 128).map(code => code.slice(0, 160));
  return result;
}

export async function checkProvenance(source, { signal, acquire = acquireBytes, verify = verifyC2pa } = {}) {
  try {
    const { bytes } = await acquire(source, { signal });
    const metadata = await readMetadata(bytes);
    let result;
    if (!metadata.format) result = makeResult('unsupported_format');
    else if (metadata.marker === 'absent') result = makeResult('no_credentials');
    else result = classifyC2pa(await verify(bytes, metadata.format, { signal }));
    result.metadataHints = metadata.metadataHints;
    result.remoteManifestNotFetched = metadata.remoteManifestNotFetched;
    return result;
  } catch { return makeResult('unavailable'); }
}
