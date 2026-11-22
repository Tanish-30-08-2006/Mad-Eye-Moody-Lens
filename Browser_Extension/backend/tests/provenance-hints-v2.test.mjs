import test from 'node:test';
import assert from 'node:assert/strict';
import { readMetadata, DIGITAL_SOURCE_TYPES, LIMITS } from '../../frontend/provenance/metadata-reader.js';
import { checkProvenance } from '../../frontend/provenance/provenance-core.js';

function pngText(key, value) {
  const chunk = (type, body) => { const out = Buffer.alloc(body.length + 12); out.writeUInt32BE(body.length); out.write(type, 4); body.copy(out, 8); return out; };
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('tEXt', Buffer.from(key + '\0' + value)), chunk('IEND', Buffer.alloc(0))]);
}
for (const type of DIGITAL_SOURCE_TYPES) test(`unsigned IPTC source: ${type}`, async () => {
  const uri = 'http://cv.iptc.org/newscodes/digitalsourcetype/' + type;
  const bytes = pngText('XML:com.adobe.xmp', `<xmp Iptc4xmpExt:DigitalSourceType="${uri}"/>`);
  const result = await checkProvenance('unused', { acquire: async () => ({ bytes }) });
  assert.equal(result.status, 'no_credentials'); assert.equal(result.aiDeclaration, 'not_declared');
  assert.ok(result.metadataHints.some(hint => hint.value === uri && hint.declared && hint.unsigned));
});
for (const [key, value, family, label] of [
  ['XML:com.adobe.xmp', '<xmp Iptc4xmpExt:AISystemUsed="ChatGPT"/>', 'OpenAI', 'IPTC AI System Used'],
  ['XML:com.adobe.xmp', '<Iptc4xmpExt:AISystemVersionUsed>version 9</Iptc4xmpExt:AISystemVersionUsed>', null, 'IPTC AI System Version Used'],
  ['XML:com.adobe.xmp', '<xmp xmp:CreatorTool="Gemini"/>', 'Google', 'Software / XMP'],
  ['Software', 'NovelAI', 'NovelAI', 'Software'],
  ['Description', 'Midjourney job id: 12345678-1234-1234-1234-123456789abc SECRET_PROMPT', 'Midjourney', 'Midjourney job id'],
  ['parameters', 'SECRET_PROMPT steps=20', 'Stable Diffusion', 'Stable Diffusion parameters'],
  ['prompt', '{"prompt":"SECRET_PROMPT"}', 'ComfyUI', 'ComfyUI prompt'],
  ['workflow', '{"prompt":"SECRET_PROMPT"}', 'ComfyUI', 'ComfyUI workflow'],
]) test(`bounded hint: ${label} / ${key}`, async () => {
  const result = await readMetadata(pngText(key, value));
  assert.ok(result.metadataHints.some(hint => hint.label === label && hint.family === family && hint.unsigned));
  assert.ok(!JSON.stringify(result).includes('SECRET_PROMPT'));
});
test('unknown tool text is truncated and TC260 keys are not guessed', async () => {
  const result = await readMetadata(pngText('Software', 'UnknownTool ' + 'x'.repeat(2000)));
  assert.equal(result.metadataHints[0].family, null); assert.equal(result.metadataHints[0].value.length, LIMITS.text);
  assert.equal((await readMetadata(pngText('AIGC', 'guess'))).metadataHints.length, 0);
});
