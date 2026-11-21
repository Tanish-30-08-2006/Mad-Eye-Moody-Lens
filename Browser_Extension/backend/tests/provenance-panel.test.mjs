import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { attachProvenancePanel, renderProvenance, disagreementNote, CAUTION, HINT_CAUTION } from '../../frontend/provenance/provenance-panel.js';
import { makeResult, unavailableResult, STATUS_LABELS } from '../../frontend/provenance/provenance-core.js';

// Minimal DOM double: any HTML sink fails the test. Browser layout/worker tests are manual.
class Element {
  constructor(tag, document) { this.tagName = tag; this.ownerDocument = document; this.childNodes = []; this.attributes = new Map(); this.listeners = new Map(); this.className = ''; this.id = ''; this.text = ''; this.classList = { contains: name => this.className.split(/\s+/).includes(name) }; }
  set innerHTML(_value) { assert.fail('HTML parsing sink is forbidden'); }
  set textContent(value) { this.text = String(value); this.childNodes = []; }
  get textContent() { return this.text + this.childNodes.map(child => child.textContent).join(''); }
  append(...children) { this.childNodes.push(...children); }
  replaceChildren(...children) { this.text = ''; this.childNodes = children; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type) { this.listeners.delete(type); }
  focus() { this.ownerDocument.activeElement = this; }
}
function setup(source = '') {
  const document = { roots: [], createElement(tag) { return new Element(tag, this); }, getElementById(id) { return this.roots.flatMap(walk).find(el => el.id === id); } };
  const root = document.createElement('section'); root.id = 'provenancePanel';
  const preview = document.createElement('img'); preview.id = 'preview'; if (source) preview.setAttribute('src', source);
  const verdict = document.createElement('p'); verdict.id = 'verdict'; verdict.className = 'verdict empty'; verdict.textContent = 'Existing detector';
  document.roots.push(root, preview, verdict);
  let observer;
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = new Map(); observer = this; }
    observe(target, options) { this.targets.set(target, options); }
    disconnect() { this.targets.clear(); }
    emit(target) { this.callback([{ target }]); }
  }
  return { document, root, preview, verdict, Observer, get observer() { return observer; } };
}
function walk(el) { return [el, ...el.childNodes.flatMap(walk)]; }
const tick = () => new Promise(resolve => setImmediate(resolve));
const declared = () => ({ ...makeResult('verified'), aiDeclaration: 'declared_ai_generated' });

test('all badges, cautions and hostile strings render as bounded literal text', () => {
  const { document, root } = setup();
  const malicious = '<img src=x onerror="globalThis.pwned=true">' + 'x'.repeat(2000);
  for (const [status, label] of Object.entries(STATUS_LABELS)) {
    const result = { ...makeResult(status), signer: malicious, claimGenerator: malicious, claimedSigningTime: malicious, actions: [{ label: malicious }], metadataHints: [{ label: malicious, value: malicious }], reasons: [malicious], remoteManifestNotFetched: true };
    renderProvenance(root, result, { document });
    assert.ok(root.textContent.includes(label)); assert.ok(root.textContent.includes(CAUTION)); assert.ok(root.textContent.includes(HINT_CAUTION));
    assert.ok(root.textContent.includes(malicious.slice(0, 120))); assert.ok(!root.textContent.includes(malicious));
    assert.equal(walk(root).some(el => el.tagName === 'img' || el.tagName === 'script'), false);
  }
  renderProvenance(root, null, { mode: 'empty', document, hasSource: false });
  assert.ok(root.textContent.includes(CAUTION)); assert.equal(document.getElementById('provenanceRecheck').disabled, true);
});

test('fast selection switches abort old checks and discard out-of-order completion; clear resets', async () => {
  const env = setup(); const pending = new Map();
  const panel = attachProvenancePanel({ document: env.document, MutationObserverImpl: env.Observer, check: (source, { signal }) => new Promise(resolve => pending.set(source, { resolve, signal })) });
  assert.deepEqual(env.observer.targets.get(env.preview).attributeFilter, ['src']);
  assert.deepEqual(env.observer.targets.get(env.verdict).attributeFilter, ['class']);
  env.preview.setAttribute('src', 'first'); env.observer.emit(env.preview);
  env.preview.setAttribute('src', 'second'); env.observer.emit(env.preview);
  assert.equal(pending.get('first').signal.aborted, true);
  pending.get('second').resolve({ ...makeResult('no_credentials'), signer: 'SECOND FILE' }); await tick();
  pending.get('first').resolve({ ...makeResult('verified'), signer: 'FIRST FILE' }); await tick();
  assert.ok(env.root.textContent.includes('SECOND FILE')); assert.ok(!env.root.textContent.includes('FIRST FILE'));
  env.preview.setAttribute('src', 'third'); env.observer.emit(env.preview);
  env.preview.removeAttribute('src'); env.observer.emit(env.preview);
  pending.get('third').resolve(makeResult('verified')); await tick();
  assert.ok(env.root.textContent.includes('No image selected')); assert.ok(!env.root.textContent.includes('Verified credentials'));
  panel.disconnect(); assert.equal(env.observer.targets.size, 0);
});

test('detector class changes only affect a fresh disagreement note; detector DOM is untouched', async () => {
  const env = setup('selected'); env.verdict.className = 'verdict real';
  const panel = attachProvenancePanel({ document: env.document, MutationObserverImpl: env.Observer, check: async () => declared() });
  await tick();
  assert.ok(!env.root.textContent.includes('different forms of evidence')); // old verdict may belong to a different image
  env.verdict.className = 'verdict empty'; env.observer.emit(env.verdict);
  env.verdict.className = 'verdict real'; env.observer.emit(env.verdict);
  assert.ok(env.root.textContent.includes('different forms of evidence'));
  assert.equal(env.verdict.textContent, 'Existing detector'); assert.equal(env.verdict.className, 'verdict real');
  env.verdict.className = 'verdict empty'; env.observer.emit(env.verdict); // prior image starts detection
  env.preview.setAttribute('src', 'next'); env.observer.emit(env.preview); await tick();
  env.verdict.className = 'verdict real'; env.observer.emit(env.verdict); // completion belongs to prior image
  assert.ok(!env.root.textContent.includes('different forms of evidence'));
  panel.disconnect();
  assert.equal(disagreementNote({ ...declared(), signatureStatus: 'invalid' }, 'verdict real'), '');
  assert.ok(disagreementNote({ ...makeResult('untrusted_signer'), aiDeclaration: 'declared_camera_capture' }, 'verdict ai'));
});

test('works with no Chrome/provider configuration and detector errors; Re-check repeats without persistence', async () => {
  const env = setup('original'); let calls = 0;
  env.verdict.textContent = 'Could not complete analysis';
  const panel = attachProvenancePanel({ document: env.document, MutationObserverImpl: env.Observer, check: async source => { assert.equal(source, 'original'); calls++; return makeResult('no_credentials'); } });
  await tick(); assert.equal(calls, 1); assert.ok(env.root.textContent.includes('No credentials found'));
  env.document.getElementById('provenanceRecheck').focus();
  await panel.recheck(); assert.equal(calls, 2); assert.equal(env.document.activeElement.id, 'provenanceRecheck');
  assert.equal(env.verdict.textContent, 'Could not complete analysis');
  panel.disconnect();
});

test('rejections become unavailable and disconnected checks cannot render', async () => {
  const env = setup('selected');
  const panel = attachProvenancePanel({ document: env.document, MutationObserverImpl: env.Observer, check: async () => { throw new Error('provider-independent failure'); } });
  await tick(); assert.ok(env.root.textContent.includes('Unavailable')); assert.ok(env.root.textContent.includes('upload the original'));
  panel.disconnect();
  const before = env.root.textContent; await panel.recheck(); assert.equal(env.root.textContent, before);
});

test('HTML integration retains classic script and adds exactly the dedicated hook and local module', async () => {
  const html = await readFile(new URL('../../frontend/sidepanel.html', import.meta.url), 'utf8');
  assert.ok(html.includes('<script src="sidepanel.js"></script>'));
  assert.equal((html.match(/id="provenancePanel"/g) || []).length, 1);
  assert.ok(html.includes('<script type="module" src="provenance/provenance-panel.js"></script>'));
  assert.ok(html.includes('href="provenance/provenance.css"'));
});

test('unavailable checks do not claim absent declarations or uninspected metadata', () => {
  const { document, root } = setup();
  renderProvenance(root, unavailableResult('bytes_unavailable'), { document });
  assert.ok(root.textContent.includes('Upload the original file'));
  assert.ok(root.textContent.includes('Metadata has not been inspected'));
  for (const text of ['Not declared', 'Ingredient count', 'No actions declared', 'No supported generator hints found']) assert.ok(!root.textContent.includes(text), text);
  const partiallyRead = { ...unavailableResult('sdk_initialization_failed'), metadataInspected: true, metadataHints: [{ label: 'Software', value: '<img src=x> ComfyUI' }] };
  renderProvenance(root, partiallyRead, { document });
  assert.ok(root.textContent.includes('WASM or worker could not start'));
  assert.ok(root.textContent.includes('<img src=x> ComfyUI')); assert.ok(root.textContent.includes(HINT_CAUTION));
  assert.ok(!root.textContent.includes('Not declared'));
});
