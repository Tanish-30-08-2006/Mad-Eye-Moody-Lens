import { capText } from './metadata-reader.js';

export const AI_LABELS = Object.freeze({ declared_ai_generated: 'Declared AI-generated', includes_ai_generated_elements: 'Includes AI-generated elements', declared_camera_capture: 'Declared camera capture', not_declared: 'Not declared' });
const sourceBase = 'http://cv.iptc.org/newscodes/digitalsourcetype/';
const sources = Object.freeze({
  [sourceBase + 'trainedAlgorithmicMedia']: 'declared_ai_generated',
  [sourceBase + 'compositeWithTrainedAlgorithmicMedia']: 'includes_ai_generated_elements',
  [sourceBase + 'digitalCapture']: 'declared_camera_capture',
  [sourceBase + 'computationalCapture']: 'declared_camera_capture'
});
const actionLabels = Object.freeze({ 'c2pa.created': 'Created', 'c2pa.edited': 'Edited', 'c2pa.cropped': 'Cropped', 'c2pa.filtered': 'Filtered', 'c2pa.opened': 'Opened', 'c2pa.resized': 'Resized', 'c2pa.converted': 'Converted', 'c2pa.placed': 'Placed', 'c2pa.redacted': 'Redacted', 'c2pa.repackaged': 'Repackaged' });

export function extractDeclarations(store) {
  const result = { signer: null, claimGenerator: null, claimedSigningTime: null, claimedDigitalSourceType: null, aiDeclaration: 'not_declared', actions: [], actionsTruncated: false, ingredientCount: 0 };
  const label = store?.active_manifest;
  if (typeof label !== 'string' || !store.manifests || !Object.hasOwn(store.manifests, label)) return result;
  const manifest = store.manifests[label];
  if (!manifest || typeof manifest !== 'object') return result;
  const signature = manifest.signature_info;
  result.signer = capText(signature?.common_name || signature?.issuer) || null;
  result.claimedSigningTime = capText(signature?.time, 80) || null;
  const generators = Array.isArray(manifest.claim_generator_info) ? manifest.claim_generator_info.slice(0, 3).map(info => [capText(info?.name, 100), capText(info?.version, 40)].filter(Boolean).join(' ')).filter(Boolean) : [];
  result.claimGenerator = capText(generators.join('; ') || manifest.claim_generator) || null;
  result.ingredientCount = Array.isArray(manifest.ingredients) ? manifest.ingredients.length : 0;
  const createdTypes = new Set();
  let inspected = 0, incomplete = false;
  const assertions = Array.isArray(manifest.assertions) ? manifest.assertions : [];
  for (const assertion of assertions.slice(0, 64)) {
    if (typeof assertion?.label !== 'string' || !/^c2pa\.actions(?:\.v\d+)?$/.test(assertion.label) || !Array.isArray(assertion.data?.actions)) continue;
    for (const action of assertion.data.actions) {
      if (++inspected > 256) { incomplete = true; break; }
      const code = capText(action?.action, 120);
      if (!code) continue;
      if (result.actions.length < 20) result.actions.push({ code, label: Object.hasOwn(actionLabels, code) ? actionLabels[code] : code });
      else result.actionsTruncated = true;
      if (action.action === 'c2pa.created' && typeof action.digitalSourceType === 'string') createdTypes.add(action.digitalSourceType);
    }
    if (incomplete) break;
  }
  incomplete ||= assertions.length > 64;
  result.actionsTruncated ||= incomplete;
  if (!incomplete && createdTypes.size === 1) {
    const type = [...createdTypes][0];
    result.claimedDigitalSourceType = capText(type);
    result.aiDeclaration = Object.hasOwn(sources, type) ? sources[type] : 'not_declared';
  }
  return result;
}
