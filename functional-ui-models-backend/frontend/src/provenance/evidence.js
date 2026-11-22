import { familyFor } from './metadata-reader.js';

export const EVIDENCE_LABELS = Object.freeze(['Signed credentials', 'Declared in metadata', 'Hint only', 'Nothing found']);
// Reviewed 2026-11-22: Cloudflare documents transformed delivery variants and
// metadata filtering. This is a possibility, never a claim about this file's past.
export const SOURCE_HOST_SNAPSHOT = Object.freeze({ date: '2026-11-22', hosts: { 'imagedelivery.net': 'Cloudflare Images' } });

export function fileFacts(bytes, metadata, source) {
  const ascii = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
  const format = metadata.format || (ascii(0, 4) === 'GIF8' ? 'image/gif' : ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, 32)) ? 'image/avif' : null);
  let reencodedPlatform = null;
  if (typeof source === 'string') {
    try { const host = new URL(source).hostname; reencodedPlatform = Object.hasOwn(SOURCE_HOST_SNAPSHOT.hosts, host) ? SOURCE_HOST_SNAPSHOT.hosts[host] : null; } catch {}
  }
  return { format, reencodedPlatform };
}

export function evidenceIndex(result) {
  if (result?.signatureStatus === 'valid') return 0;
  if (result?.metadataHints?.some(hint => hint.declared) || (result?.aiDeclaration && result.aiDeclaration !== 'not_declared')) return 1;
  if (result?.metadataHints?.length) return 2;
  return result?.status === 'no_credentials' && result.metadataInspected ? 3 : null;
}

export function absenceExplanation(result) {
  if (!['no_credentials', 'unsupported_format'].includes(result?.status)) return null;
  const type = { 'image/webp': 'WebP', 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/avif': 'AVIF', 'image/gif': 'GIF' }[result.format] || 'This file';
  const observation = result.status === 'unsupported_format' ? `${type} credentials are not supported here; this is not a finding of absence.` : `${type}: no embedded credentials were found in this copy.`;
  const host = result.reencodedPlatform ? ` ${result.reencodedPlatform} often serves processed image variants.` : '';
  return `${observation}${host} Screenshots, re-encoding, format conversion and sharing often remove metadata. The file may also never have had credentials. Use the original download when possible.`;
}

export function makerLinks(result) {
  const families = new Set([familyFor(result?.signer), familyFor(result?.claimGenerator), ...(result?.metadataHints || []).map(hint => hint.family)]);
  const nothing = evidenceIndex(result) === 3;
  return [
    { family: 'OpenAI', label: 'Check with OpenAI', url: 'https://openai.com/verify' },
    { family: 'Google', label: 'Check with Google', url: 'https://gemini.google.com/' }
  ].filter(link => nothing || families.has(link.family));
}
