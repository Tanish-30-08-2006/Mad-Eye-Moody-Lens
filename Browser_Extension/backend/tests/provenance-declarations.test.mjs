import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractDeclarations } from '../../frontend/provenance/declarations.js';
import { classifyC2pa } from '../../frontend/provenance/provenance-core.js';
const base = 'http://cv.iptc.org/newscodes/digitalsourcetype/';
function store(actions, extra = {}) { return { active_manifest: 'current', manifests: { current: { assertions: [{ label: 'c2pa.actions.v2', data: { actions } }], ...extra } } }; }

test('extracts active fixture signer, tool, declared AI and actual recorded edits', async () => {
  const recorded = JSON.parse(await readFile(new URL('./fixtures/provenance/signed.sdk-test-trusted.json', import.meta.url)));
  const result = classifyC2pa({ kind: 'manifest', store: recorded });
  assert.equal(result.status, 'verified'); assert.equal(result.aiDeclaration, 'declared_ai_generated');
  assert.equal(result.signer, 'MML TEST ONLY Signer A'); assert.equal(result.claimGenerator, 'ProvenanceFixture 1.0');
  assert.equal(result.claimedSigningTime, null); assert.deepEqual(result.actions.map(a => a.label), ['Created', 'Edited', 'Cropped', 'Filtered']);
});

test('maps only exact source URIs from created actions; editing declarations do not imply origin', () => {
  for (const [source, declaration] of Object.entries({ trainedAlgorithmicMedia: 'declared_ai_generated', compositeWithTrainedAlgorithmicMedia: 'includes_ai_generated_elements', digitalCapture: 'declared_camera_capture', computationalCapture: 'declared_camera_capture' })) {
    assert.equal(extractDeclarations(store([{ action: 'c2pa.created', digitalSourceType: base + source }])).aiDeclaration, declaration);
    assert.equal(extractDeclarations(store([{ action: 'c2pa.edited', digitalSourceType: base + source }])).aiDeclaration, 'not_declared');
  }
  assert.equal(extractDeclarations(store([{ action: 'c2pa.created', digitalSourceType: 'https://attacker.example/trainedAlgorithmicMedia' }])).aiDeclaration, 'not_declared');
});

test('never traverses ingredient/other manifests and labels only reported signing time', () => {
  const input = store([{ action: 'c2pa.created', when: 'creation is not signing time' }], { signature_info: { issuer: 'Issuer', time: '2026-11-21T00:00:00Z' }, ingredients: [{}, {}], claim_generator: 'LegacyTool/1.0' });
  input.manifests.old = { assertions: [{ label: 'c2pa.actions', data: { actions: [{ action: 'c2pa.created', digitalSourceType: base + 'trainedAlgorithmicMedia' }] } }] };
  const result = extractDeclarations(input);
  assert.equal(result.aiDeclaration, 'not_declared'); assert.equal(result.signer, 'Issuer'); assert.equal(result.claimedSigningTime, '2026-11-21T00:00:00Z');
  assert.equal(result.ingredientCount, 2); assert.equal(result.claimGenerator, 'LegacyTool/1.0');
});

test('caps hostile strings/actions, preserves unknown actions as literal text, handles malformed types', () => {
  const attack = '<img src=x onerror=alert(1)>' + 'x'.repeat(1000);
  const result = extractDeclarations(store(Array.from({ length: 40 }, () => ({ action: attack })), { signature_info: { common_name: attack }, claim_generator: attack }));
  assert.equal(result.signer.length, 240); assert.equal(result.claimGenerator.length, 240); assert.equal(result.actions.length, 20); assert.equal(result.actionsTruncated, true);
  assert.equal(result.actions[0].label, attack.slice(0, 120));
  for (const value of [null, {}, { active_manifest: '__proto__', manifests: {} }, store([], { assertions: null, ingredients: 'bad', claim_generator_info: {} })]) assert.equal(extractDeclarations(value).aiDeclaration, 'not_declared');
});

test('conflicting or incompletely inspected source declarations remain not declared', () => {
  assert.equal(extractDeclarations(store([{ action: 'c2pa.created', digitalSourceType: base + 'digitalCapture' }, { action: 'c2pa.created', digitalSourceType: base + 'trainedAlgorithmicMedia' }])).aiDeclaration, 'not_declared');
  const result = extractDeclarations(store(Array.from({ length: 300 }, () => ({ action: 'c2pa.created', digitalSourceType: base + 'digitalCapture' }))));
  assert.equal(result.aiDeclaration, 'not_declared'); assert.equal(result.actionsTruncated, true);
});
