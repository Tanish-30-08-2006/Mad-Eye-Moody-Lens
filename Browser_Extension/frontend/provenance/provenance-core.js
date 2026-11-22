import { acquireBytes } from './bytes.js';
import { readMetadata } from './metadata-reader.js';
import { verifyC2pa } from './c2pa-verifier.js';
import { extractDeclarations } from './declarations.js';

export const SCHEMA_VERSION = 1;
export const STATUS_LABELS = Object.freeze({ verified: 'Verified credentials', untrusted_signer: 'Unknown signer', invalid: 'Signature invalid', no_credentials: 'No credentials found', unsupported_format: 'Unsupported format', unavailable: 'Unavailable' });
const messages = Object.freeze({
  verified: 'Signature, file binding and signer trust were validated against the bundled trust snapshot.',
  untrusted_signer: 'The signature and file binding are valid; this signer is outside the bundled trust snapshot.',
  invalid: 'The SDK reported a signature or signed-content hash mismatch.',
  no_credentials: 'No embedded credentials found. Sharing platforms often strip file metadata.',
  unsupported_format: 'File credentials are checked for JPEG, PNG and WebP only.',
  unavailable: 'The check could not complete. Try Re-check or upload the original file instead.'
});

const diagnostics = Object.freeze({
  bytes_unavailable: 'Original image bytes could not be downloaded or read. The host may block access or redirects. Upload the original file instead.',
  source_rejected: 'Only public HTTP(S) image URLs or uploaded files can be checked. Upload the original file instead.',
  size_limit_exceeded: 'This image exceeds the 8 MB file limit. Choose a smaller original file.',
  sdk_load_failed: 'The packaged C2PA verifier could not load. Reload the extension and Re-check.',
  trust_anchors_unavailable: 'The packaged signer trust lists could not be read. Reload the extension and Re-check.',
  sdk_initialization_failed: 'The C2PA WASM or worker could not start. Reload the extension; check the side panel DevTools for CSP, WASM or worker errors.',
  verifier_timeout: 'The C2PA verifier exceeded its time limit. Try Re-check.',
  verification_failed: 'The SDK could not finish reading these credentials. Re-check, or upload the original file instead.',
  validation_incomplete: 'The SDK did not supply enough validation evidence to classify these credentials.',
  check_cancelled: 'The check was cancelled. Select an image or use Re-check.',
  malformed_manifest: 'Embedded credentials are malformed or could not be parsed. This does not establish tampering.',
  remote_manifest_not_fetched: 'This file refers to remote credentials. They were not downloaded, so verification is unavailable.',
  check_failed: messages.unavailable
});

export function unavailableResult(code = 'check_failed') {
  const result = makeResult('unavailable');
  result.diagnosticCode = Object.hasOwn(diagnostics, code) ? code : 'check_failed';
  result.message = diagnostics[result.diagnosticCode];
  return result;
}

/** @typedef {'verified'|'untrusted_signer'|'invalid'|'no_credentials'|'unsupported_format'|'unavailable'} ProvenanceStatus */
/** @returns {{schemaVersion:number,status:ProvenanceStatus,signatureStatus:string,signerTrust:string,reasons:string[],signer:null|string,claimGenerator:null|string,claimedSigningTime:null|string,aiDeclaration:string,actions:object[],ingredientCount:number,metadataHints:object[],remoteManifestNotFetched:boolean,message:string}} */
export function makeResult(status) {
  return { schemaVersion: SCHEMA_VERSION, status, signatureStatus: status === 'verified' || status === 'untrusted_signer' ? 'valid' : status === 'invalid' ? 'invalid' : status === 'no_credentials' ? 'absent' : 'unknown', signerTrust: status === 'verified' ? 'trusted' : status === 'untrusted_signer' ? 'untrusted' : 'unknown', reasons: [], signer: null, claimGenerator: null, claimedSigningTime: null, claimedDigitalSourceType: null, aiDeclaration: 'not_declared', actions: [], actionsTruncated: false, ingredientCount: 0, metadataHints: [], metadataInspected: false, diagnosticCode: null, reasonCode: null, reason: null, certificateType: 'not_established', remoteManifestNotFetched: false, message: messages[status] };
}

const integrityFailures = new Set(['claimSignature.mismatch', 'assertion.dataHash.mismatch', 'assertion.bmffHash.mismatch', 'assertion.boxesHash.mismatch', 'assertion.collectionHash.mismatch', 'assertion.hashedURI.mismatch', 'hashedURI.mismatch']);
const trustFailures = new Set(['signingCredential.untrusted', 'signingCredential.expired', 'claimSignature.outsideValidity', 'signingCredential.invalid', 'signingCredential.ocsp.revoked']);
const reasonMessages = Object.freeze({ integrity_mismatch: 'Signature or signed-content hash mismatch. The cause and intent are not established.', signer_not_trusted: 'The signature and file binding validate, but the signer is outside the offline trust snapshot. Self-signed/test certificate type is not established by the SDK.', certificate_expired: 'The signing certificate is outside its validity period. This is separate from a signature or file-hash mismatch.', certificate_invalid: 'The signing certificate is unusable or revoked. Its cause, including whether it is self-signed or a test certificate, is not established.', malformed_manifest: 'The credential structure is malformed. This is separate from tampering.', validation_incomplete: 'The SDK did not establish enough evidence to validate these credentials.' });
function codeList(items) { return Array.isArray(items) ? items.map(x => x?.code).filter(x => typeof x === 'string') : []; }
export function classifyC2pa(outcome) {
  if (outcome?.kind !== 'manifest') return ['no_credentials', 'invalid', 'unsupported_format'].includes(outcome?.kind) ? makeResult(outcome.kind) : unavailableResult(outcome?.diagnosticCode);
  const store = outcome.store;
  const active = typeof store?.active_manifest === 'string' && store.manifests && Object.hasOwn(store.manifests, store.active_manifest) && store.manifests[store.active_manifest];
  const validation = store?.validation_results?.activeManifest;
  if (!active || !validation) return unavailableResult('validation_incomplete');
  const success = codeList(validation.success), failures = codeList(validation.failure);
  const reasons = [...success, ...codeList(validation.informational), ...failures, ...codeList(store.validation_status)];
  for (const delta of (store.validation_results.ingredientDeltas || []).slice(0, 64)) {
    reasons.push(...codeList(delta.validationDeltas?.success), ...codeList(delta.validationDeltas?.informational), ...codeList(delta.validationDeltas?.failure));
  }
  const cryptoValid = success.includes('claimSignature.validated');
  const bindingValid = success.includes('assertion.dataHash.match');
  let status = 'unavailable', reasonCode = 'validation_incomplete';
  if (failures.some(code => integrityFailures.has(code))) { status = 'invalid'; reasonCode = 'integrity_mismatch'; }
  else if (failures.some(code => /malformed|claim\.cbor\.invalid|assertion\.json\.invalid/.test(code))) reasonCode = 'malformed_manifest';
  else if (cryptoValid && bindingValid && store.validation_state === 'Trusted' && !failures.length && success.includes('signingCredential.trusted')) { status = 'verified'; reasonCode = null; }
  else if (failures.length && failures.every(code => trustFailures.has(code))) {
    if (cryptoValid && bindingValid) status = 'untrusted_signer';
    reasonCode = failures.some(code => ['signingCredential.expired', 'claimSignature.outsideValidity'].includes(code)) ? 'certificate_expired' : failures.some(code => ['signingCredential.invalid', 'signingCredential.ocsp.revoked'].includes(code)) ? 'certificate_invalid' : 'signer_not_trusted';
  }
  const result = status === 'unavailable' ? unavailableResult(reasonCode === 'malformed_manifest' ? reasonCode : 'validation_incomplete') : makeResult(status);
  result.reasonCode = reasonCode;
  result.reason = reasonCode ? reasonMessages[reasonCode] : null;
  if (result.reason) result.message = result.reason;
  Object.assign(result, extractDeclarations(store));
  result.reasons = [...new Set(reasons)].slice(0, 128).map(code => code.slice(0, 160));
  return result;
}

export async function checkProvenance(source, { signal, acquire = acquireBytes, verify = verifyC2pa } = {}) {
  let stage = 'bytes_unavailable';
  try {
    const { bytes } = await acquire(source, { signal });
    stage = 'check_failed';
    const metadata = await readMetadata(bytes);
    let result;
    if (!metadata.format) result = makeResult('unsupported_format');
    else if (metadata.marker === 'absent') result = makeResult('no_credentials');
    else result = classifyC2pa(await verify(bytes, metadata.format, { signal }));
    result.metadataHints = metadata.metadataHints;
    result.metadataInspected = true;
    result.remoteManifestNotFetched = metadata.remoteManifestNotFetched;
    return result;
  } catch (error) { return unavailableResult(stage === 'bytes_unavailable' ? (Object.hasOwn(diagnostics, error?.code) ? error.code : stage) : stage); }
}
