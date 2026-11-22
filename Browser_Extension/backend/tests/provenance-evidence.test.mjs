import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceIndex, EVIDENCE_LABELS, absenceExplanation, fileFacts, makerLinks } from '../../frontend/provenance/evidence.js';
import { makeResult } from '../../frontend/provenance/provenance-core.js';

test('four evidence labels never score or treat unavailable as absence', () => {
  assert.equal(EVIDENCE_LABELS.length, 4); assert.ok(!EVIDENCE_LABELS.join('').includes('%'));
  assert.equal(evidenceIndex(makeResult('verified')), 0);
  assert.equal(evidenceIndex({ ...makeResult('no_credentials'), metadataInspected: true, remoteManifestNotFetched: true }), 2);
  assert.equal(evidenceIndex({ ...makeResult('no_credentials'), metadataHints: [{ declared: true }] }), 1);
  assert.equal(evidenceIndex({ ...makeResult('no_credentials'), metadataHints: [{ declared: false }] }), 2);
  assert.equal(evidenceIndex({ ...makeResult('no_credentials'), metadataInspected: true }), 3);
  for (const status of ['unavailable', 'unsupported_format', 'invalid']) assert.equal(evidenceIndex(makeResult(status)), null);
  assert.equal(absenceExplanation(makeResult('unavailable')), null);
});
test('absence explanation uses byte type and exact reviewed host; website omits host', () => {
  const bytes = Buffer.from('GIF89a');
  assert.equal(fileFacts(bytes, {}, 'https://imagedelivery.net/a/b/c').reencodedPlatform, 'Cloudflare Images');
  assert.equal(fileFacts(bytes, {}, 'https://imagedelivery.net.evil.example/a').reencodedPlatform, null);
  assert.equal(fileFacts(bytes, {}, null).reencodedPlatform, null);
  const unsupported = { ...makeResult('unsupported_format'), ...fileFacts(bytes, {}, null) };
  assert.ok(absenceExplanation(unsupported).includes('not a finding of absence'));
  const plain = { ...makeResult('no_credentials'), format: 'image/webp' };
  assert.ok(absenceExplanation(plain).includes('WebP')); assert.ok(absenceExplanation(plain).includes('often'));
});
test('vendor links are fixed, contextual and carry no image data', () => {
  const empty = { ...makeResult('no_credentials'), metadataInspected: true };
  assert.equal(makerLinks(empty).length, 2);
  assert.deepEqual(makerLinks({ ...empty, metadataHints: [{ family: 'OpenAI' }] }).map(link => link.url), ['https://openai.com/verify']);
  assert.deepEqual(makerLinks({ ...makeResult('verified'), signer: 'Google C2PA' }).map(link => link.url), ['https://gemini.google.com/']);
  assert.equal(makerLinks({ ...empty, metadataHints: [{ family: 'NovelAI' }] }).length, 0);
});
