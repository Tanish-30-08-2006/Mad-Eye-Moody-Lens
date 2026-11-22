import { useEffect, useState } from 'react';
import { checkFile, createSelectionRunner } from './engine.js';
import type { OriginResult, SelectionState } from './engine';
import { STATUS_LABELS, makeResult } from './provenance-core.js';
import { AI_LABELS } from './declarations.js';
import { capText } from './metadata-reader.js';
import { EVIDENCE_LABELS, evidenceIndex, absenceExplanation, makerLinks } from './evidence.js';
import './origin.css';

export function OriginCheckView({ result, checking = false, fileName = '', onRecheck }: {
  result: OriginResult | null; checking?: boolean; fileName?: string; onRecheck?: () => void;
}) {
  const shown = result || makeResult('unavailable');
  const tone = shown.status === 'verified' ? 'likely_real' : shown.status === 'invalid' ? 'likely_fake' : shown.status === 'untrusted_signer' ? 'uncertain' : 'inconclusive';
  const explanation = absenceExplanation(shown), links = makerLinks(shown);
  const startupUnavailable = shown.status === 'unavailable' && ['sdk_load_failed', 'trust_anchors_unavailable', 'sdk_initialization_failed'].includes(shown.diagnosticCode || '');
  const hasDeclarations = shown.signer || shown.claimGenerator || shown.claimedSigningTime || shown.actions.length;
  return <aside className="result origin-card" aria-label="Origin check for the selected image" aria-busy={checking}>
    <header className="result__head"><div><h2>Origin check</h2><span className="label">Selected file · {capText(fileName, 120)}</span></div>
      <button type="button" className="origin-recheck" onClick={onRecheck} disabled={checking} aria-label="Re-check selected image origin">Re-check</button>
    </header>
    <div className="origin-content">
      <p className={`verdict-chip v-${tone}`} role="status" aria-live="polite"><span className="vmark" aria-hidden="true" />{checking ? 'Checking file credentials…' : STATUS_LABELS[shown.status] || STATUS_LABELS.unavailable}</p>
      {checking ? <p className="note">Reading the original file locally…</p> : <>
        <p>{startupUnavailable ? 'Local origin check could not start. Re-check or reload this page.' : capText(shown.message, 600)}</p>
        <ol className="origin-evidence" aria-label="Origin evidence; separate from the detector score">{EVIDENCE_LABELS.map((label, index) => <li key={label} className={index === evidenceIndex(shown) ? 'active' : ''} aria-current={index === evidenceIndex(shown) ? 'step' : undefined}><span aria-hidden="true">●</span>{label}</li>)}</ol>
        {explanation && <details><summary>Why nothing was found?</summary><p className="note">{explanation}</p></details>}
        {hasDeclarations ? <>
          {shown.status !== 'verified' && <p className="note">Credential statements below have not been authenticated by a trusted, valid signature.</p>}
          <dl className="origin-details">
            <dt>Signer (credential)</dt><dd>{capText(shown.signer) || 'Not declared'}</dd>
            <dt>Tool / claim generator</dt><dd>{capText(shown.claimGenerator) || 'Not declared'}</dd>
            <dt>Claimed signing time</dt><dd>{capText(shown.claimedSigningTime, 80) || 'Not declared'}</dd>
            <dt>AI declaration</dt><dd>{AI_LABELS[shown.aiDeclaration] || AI_LABELS.not_declared}</dd>
            {shown.claimedDigitalSourceType && <><dt>Claimed digital source type</dt><dd>{capText(shown.claimedDigitalSourceType)}</dd></>}
            <dt>Ingredients</dt><dd>{Number.isSafeInteger(shown.ingredientCount) ? shown.ingredientCount : 0}</dd>
          </dl>
          <details><summary>Recorded actions (active credential)</summary><ul>{shown.actions.slice(0, 20).map((action, index) => <li key={index}>{capText(action.label, 120)}</li>)}</ul>{shown.actionsTruncated && <p className="note">Action list truncated.</p>}</details>
        </> : shown.status === 'unavailable' && <p className="note">Credential details were not read; no origin or edit-history conclusion is available.</p>}
        <h3>Unsigned metadata hints</h3>
        <p className="note">Unsigned, can be forged. Metadata is a lead, never proof.</p>
        <ul className="origin-hints">{shown.metadataHints.slice(0, 12).map((hint, index) => <li key={index}><span className="tag">unsigned</span><span>{capText(hint.label, 80)}: {capText(hint.value)}</span></li>)}</ul>
        {!shown.metadataHints.length && <p className="note">{shown.metadataInspected ? 'No supported generator hints found' : 'Metadata has not been inspected.'}</p>}
        {shown.remoteManifestNotFetched && <p className="note">A remote manifest link exists. It was not fetched to protect your privacy.</p>}
        {links.length > 0 && <><div className="origin-maker-links">{links.map(link => <a className="tag" key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`${link.label}; opens vendor site in a new tab`}>{link.label}</a>)}</div><p className="note">You upload on the vendor’s site, not here. Nothing is sent automatically. This check cannot read SynthID.</p></>}
        {shown.reasons.length > 0 && <details><summary>SDK validation codes</summary><ul>{shown.reasons.slice(0, 128).map((code, index) => <li key={index}>{capText(code, 160)}</li>)}</ul></details>}
      </>}
      <p className="note origin-caution">A valid signature does not prove the content is true. Missing credentials do not prove authenticity.</p>
    </div>
  </aside>;
}

export default function OriginCheckCard({ file }: { file: File }) {
  const [state, setState] = useState<SelectionState>({ file: null, checking: true, result: null });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const runner = createSelectionRunner(checkFile, setState);
    void runner.run(file);
    return () => runner.dispose();
  }, [file, revision]);
  // Before effects run for a replacement, never paint the previous file's result.
  const current = state.file === file;
  return <OriginCheckView fileName={file.name} checking={!current || state.checking} result={current ? state.result : null} onRecheck={() => setRevision(value => value + 1)} />;
}
