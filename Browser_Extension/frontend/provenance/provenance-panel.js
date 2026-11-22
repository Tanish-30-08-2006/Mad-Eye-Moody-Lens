import { checkProvenance, makeResult, STATUS_LABELS } from './provenance-core.js';
import { AI_LABELS } from './declarations.js';
import { capText } from './metadata-reader.js';
import { EVIDENCE_LABELS, evidenceIndex, absenceExplanation, makerLinks } from './evidence.js';

export const CAUTION = 'A valid signature does not prove the content is true. Missing credentials do not prove authenticity.';
export const HINT_CAUTION = 'Unsigned, can be forged. Metadata is a lead, never proof.';

export function disagreementNote(result, detectorClass) {
  if (result?.signatureStatus !== 'valid') return '';
  const classes = new Set(String(detectorClass).split(/\s+/));
  if (classes.has('real') && ['declared_ai_generated', 'includes_ai_generated_elements'].includes(result.aiDeclaration)) return 'The credential declares AI involvement; the detector says likely not AI-generated. These are different forms of evidence. Both results remain visible.';
  if (classes.has('ai') && result.aiDeclaration === 'declared_camera_capture') return 'The credential declares camera capture; the detector reports an AI signal. Capture may be followed by edits. Both results remain visible.';
  return '';
}

export function renderProvenance(root, result, { mode = 'result', hasSource = true, detectorClass = '', document = root.ownerDocument } = {}) {
  const focused = document.activeElement?.id === 'provenanceRecheck';
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = capText(text, 600);
    if (className) node.className = className;
    return node;
  };
  const header = element('div', undefined, 'provenance-heading');
  header.append(element('h2', 'Provenance (file credentials)'));
  const button = element('button', 'Re-check', 'secondary');
  button.id = 'provenanceRecheck'; button.type = 'button'; button.disabled = !hasSource || mode === 'checking';
  header.append(button);
  const status = result && Object.hasOwn(STATUS_LABELS, result.status) ? result.status : 'unavailable';
  const badge = element('p', mode === 'empty' ? 'No image selected' : mode === 'checking' ? 'Checking file credentials…' : STATUS_LABELS[status], `provenance-badge provenance-${mode === 'result' ? status : 'neutral'}`);
  badge.setAttribute('role', 'status'); badge.setAttribute('aria-live', 'polite');
  const content = element('div', undefined, 'provenance-content');
  if (mode === 'empty') content.append(element('p', 'Choose an image to inspect its original file credentials.'));
  else if (mode === 'checking') content.append(element('p', 'Reading file bytes and checking locally…'));
  else {
    content.append(element('p', result?.message || makeResult('unavailable').message));
    const strip = element('ol', undefined, 'provenance-evidence');
    strip.setAttribute('aria-label', 'Origin evidence; separate from the detector score');
    EVIDENCE_LABELS.forEach((label, index) => {
      const step = element('li', undefined, index === evidenceIndex(result) ? 'active' : '');
      const dot = element('span', '●', 'provenance-dot'); dot.setAttribute('aria-hidden', 'true');
      step.setAttribute('aria-current', index === evidenceIndex(result) ? 'step' : 'false');
      step.append(dot, element('span', label)); strip.append(step);
    });
    content.append(strip);
    const explanation = absenceExplanation(result);
    if (explanation) {
      const details = element('details'); details.append(element('summary', 'Why nothing was found?'), element('p', explanation)); content.append(details);
    }
    if (result?.signer || result?.actions?.length) {
      if (status !== 'verified') content.append(element('p', 'Credential statements below have not been authenticated by a trusted, valid signature.', 'provenance-warning'));
    }
    const hasDeclarations = Boolean(result?.signer || result?.claimGenerator || result?.claimedSigningTime || result?.claimedDigitalSourceType || result?.actions?.length);
    if (status === 'unavailable' && !hasDeclarations) {
      content.append(element('p', 'Credential details were not read; no origin or edit-history conclusion is available.'));
    } else {
      const details = element('dl');
      const row = (label, value) => { details.append(element('dt', label), element('dd', capText(value, 240) || 'Not declared')); };
      row('Signer (credential)', result?.signer);
      row('Tool / claim generator', result?.claimGenerator);
      row('Claimed signing time', result?.claimedSigningTime);
      row('AI declaration', Object.hasOwn(AI_LABELS, result?.aiDeclaration || '') ? AI_LABELS[result.aiDeclaration] : AI_LABELS.not_declared);
      if (result?.claimedDigitalSourceType) row('Claimed digital source type', result.claimedDigitalSourceType);
      row('Ingredient count', String(Number.isSafeInteger(result?.ingredientCount) ? result.ingredientCount : 0));
      content.append(details, element('h3', 'Recorded actions (active credential)'));
      const actions = element('ul');
      for (const action of (Array.isArray(result?.actions) ? result.actions : []).slice(0, 20)) actions.append(element('li', capText(action?.label, 120)));
      if (!actions.childNodes.length) actions.append(element('li', 'No actions declared'));
      content.append(actions);
      if (result?.actionsTruncated) content.append(element('p', 'Action list truncated.'));
    }
    content.append(element('h3', 'Unsigned metadata hints'), element('p', HINT_CAUTION, 'provenance-warning'));
    const hints = element('ul');
    for (const hint of (Array.isArray(result?.metadataHints) ? result.metadataHints : []).slice(0, 12)) {
      const chip = element('li', undefined, 'provenance-hint-chip');
      chip.append(element('span', 'unsigned', 'pill warn'), element('span', `${capText(hint?.label, 80)}: ${capText(hint?.value, 240)}`)); hints.append(chip);
    }
    if (!hints.childNodes.length) hints.append(element('li', result?.metadataInspected ? 'No supported generator hints found' : 'Metadata has not been inspected.'));
    content.append(hints);
    const links = makerLinks(result);
    if (links.length) {
      const row = element('div', undefined, 'provenance-maker-links');
      for (const link of links) {
        const anchor = element('a', link.label, 'secondary');
        anchor.setAttribute('href', link.url); anchor.setAttribute('target', '_blank'); anchor.setAttribute('rel', 'noopener noreferrer'); anchor.setAttribute('referrerpolicy', 'no-referrer'); anchor.setAttribute('aria-label', `${link.label}; opens the vendor site in a new tab`); row.append(anchor);
      }
      content.append(row, element('p', 'You upload on the vendor’s site, not here. Nothing is sent by these links automatically. This check cannot read SynthID.', 'hint'));
    }
    if (result?.remoteManifestNotFetched) content.append(element('p', 'A remote manifest link exists. It was not fetched to protect your privacy.'));
    const note = disagreementNote(result, detectorClass);
    if (note) content.append(element('p', note, 'provenance-disagreement'));
    if (result?.reasons?.length) {
      const reasons = element('details'); reasons.append(element('summary', 'SDK validation codes'));
      const list = element('ul');
      for (const code of result.reasons.slice(0, 128)) list.append(element('li', capText(code, 160)));
      reasons.append(list); content.append(reasons);
    }
  }
  root.replaceChildren(header, badge, content, element('p', CAUTION, 'provenance-caution'));
  root.setAttribute('aria-busy', String(mode === 'checking'));
  if (focused && !button.disabled) button.focus();
}

export function attachProvenancePanel({ document = globalThis.document, MutationObserverImpl = globalThis.MutationObserver, check = checkProvenance } = {}) {
  const root = document?.getElementById('provenancePanel'), preview = document?.getElementById('preview'), verdict = document?.getElementById('verdict');
  if (!root || !preview || !verdict || !MutationObserverImpl) return null;
  let generation = 0, controller, source, result = null, mode = 'empty';
  let detectorCycle = false, detectorFresh = false, disposed = false;
  const draw = () => renderProvenance(root, result, { document, mode, hasSource: Boolean(source), detectorClass: detectorFresh ? verdict.className : '' });
  async function select(force = false) {
    const next = preview.getAttribute('src') || '';
    if (disposed || (!force && next === source)) return;
    if (next !== source) { detectorCycle = false; detectorFresh = false; }
    source = next; const ticket = ++generation;
    controller?.abort(); controller = new AbortController(); result = null;
    mode = source ? 'checking' : 'empty'; draw();
    if (!source) return;
    let checked;
    try { checked = await check(source, { signal: controller.signal }); }
    catch { checked = makeResult('unavailable'); }
    if (disposed || ticket !== generation || next !== (preview.getAttribute('src') || '')) return;
    result = checked; mode = 'result'; draw();
  }
  const observer = new MutationObserverImpl(records => {
    if (records.some(record => record.target === preview)) void select();
    if (records.some(record => record.target === verdict)) {
      if (verdict.classList.contains('empty')) { detectorCycle = true; detectorFresh = false; }
      else if (detectorCycle) detectorFresh = true;
      draw();
    }
  });
  observer.observe(preview, { attributes: true, attributeFilter: ['src'] });
  observer.observe(verdict, { attributes: true, attributeFilter: ['class'] });
  const click = event => { if (event.target?.id === 'provenanceRecheck') void select(true); };
  root.addEventListener('click', click);
  void select();
  const disconnect = () => { disposed = true; generation++; controller?.abort(); result = null; source = ''; observer.disconnect(); root.removeEventListener('click', click); };
  document.defaultView?.addEventListener('pagehide', disconnect, { once: true });
  return { recheck: () => select(true), disconnect };
}

if (globalThis.document) attachProvenancePanel();
