import React, { useEffect, useState } from 'react';
import type { ComposerSnapshot } from '../adapters/reddit/composer';
import { relevantRules, ruleLabel, rulesLink, type CommunityPolicy } from '../core/community-policy';
import { draftMime, encodeDraft, MAX_DRAFT_BYTES } from '../core/draft-media';
import type { ExtensionMessage, ExtensionResponse } from '../core/messaging';
import type { ExtensionSettings } from '../core/settings';
import { VERDICT_TEXT, verdictOf } from '../core/verdict';
import { CopyPreview } from './CopyPreview';
import { contextText } from './share';

type Props = {
  snapshot: ComposerSnapshot;
  isCurrent: () => boolean;
  settings: ExtensionSettings;
  send: (message: ExtensionMessage) => Promise<ExtensionResponse>;
};

export function ComposerPanel({ snapshot, isCurrent, settings, send }: Props) {
  const { subreddit, postType, files, flairControl, repost } = snapshot;
  const [policy, setPolicy] = useState<CommunityPolicy | null>();
  const [repostText, setRepostText] = useState('');
  const [disclosure, setDisclosure] = useState('');
  const [prepared, setPrepared] = useState('');
  const [confirmUpload, setConfirmUpload] = useState(false);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!subreddit) return;
    let alive = true;
    void send({ type: 'GET_COMMUNITY_POLICY', payload: { subreddit } }).then((result) => {
      if (!alive || !isCurrent()) return;
      setPolicy(result.type === 'COMMUNITY_POLICY' && result.policy.subreddit === subreddit ? result.policy : null);
    }).catch(() => { if (alive && isCurrent()) setPolicy(null); });
    return () => { alive = false; };
  }, [subreddit, postType, send, isCurrent]);

  useEffect(() => {
    if (!repost) return;
    let alive = true;
    void send({ type: 'GET_POST_SOURCE', payload: { permalink: repost, explicit: false } }).then((response) => {
      if (alive && isCurrent() && response.type === 'POST_SOURCE' && response.source) setRepostText(contextText(response.source));
    }).catch(() => {});
    return () => { alive = false; };
  }, [repost, send, isCurrent]);

  const rules = policy === undefined ? undefined : policy?.subreddit === subreddit ? relevantRules(policy, postType) : null;
  const flair = rules?.some((rule) => rule.kind === 'flair') ? policy?.flair : undefined;
  const file = files.length === 1 ? files[0] : undefined;
  const supportedFile = file && file.size > 0 && file.size <= MAX_DRAFT_BYTES && draftMime(file.type) ? file : null;

  const scan = async () => {
    if (!supportedFile || !isCurrent() || settings.localOnly || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const consent = await send({ type: 'GET_CONSENT' });
      if (!isCurrent()) return;
      if (consent.type !== 'CONSENT' || !consent.accepted) {
        setNeedsConsent(true);
        return;
      }
      setNeedsConsent(false);
      const base64 = await encodeDraft(supportedFile);
      if (!isCurrent()) return;
      setStatus('Scanning attachment…');
      const response = await send({ type: 'SCAN_DRAFT', payload: { mime: supportedFile.type, base64, apiUrl: settings.apiUrl } });
      if (!isCurrent()) return;
      if (response.type === 'ERROR') {
        setStatus(response.error);
      } else if (response.type !== 'JOB_STATUS' || response.result?.status !== 'completed') {
        setStatus('Analysis unavailable for this attachment.');
      } else if (response.result.mock !== false) {
        setStatus('No verified inference result. Demo or unmarked results do not inform a disclosure.');
      } else {
        setStatus(VERDICT_TEXT[verdictOf(response.result, settings)] + ' — automated estimate. Choose disclosure wording based on how you made the attachment.');
      }
    } catch {
      if (isCurrent()) setStatus('Unable to scan this attachment. Your Reddit draft is still available.');
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };

  const accept = async () => {
    try {
      const result = await send({ type: 'SET_CONSENT', payload: { accepted: true } });
      if (isCurrent() && result.type === 'CONSENT' && result.accepted) setNeedsConsent(false);
      else if (isCurrent()) setStatus('Could not save upload consent.');
    } catch {
      if (isCurrent()) setStatus('Could not save upload consent.');
    }
  };

  return (
    <section className="moody-lens-composer moody-lens-card moody-lens-provenance" aria-label="Moody Lens posting guidance">
      <h2 className="moody-lens-card-title">Moody Lens · Before you post</h2>
      {!subreddit && <p>Choose a community in Reddit. If the selected community is not shown here, use Reddit’s rules and flair picker directly.</p>}
      {subreddit && <>
        <p><strong>r/{subreddit}</strong> · <a href={rulesLink(subreddit)} target="_blank" rel="noopener noreferrer">Community rules</a></p>
        {rules === undefined && <p role="status">Checking community rules…</p>}
        {rules === null && <p>Community rules unavailable. Open Reddit’s rules to check before posting.</p>}
        {rules?.length === 0 && <p>No relevant rule was found in the available rules. Check the full rules before posting.</p>}
        {rules?.filter((rule, index, all) => all.findIndex((r) => r.kind === rule.kind && r.title === rule.title) === index)
          .slice(0, 4).map((rule) => (
            <p key={rule.kind + rule.title}><strong>{ruleLabel[rule.kind]} · {rule.title}</strong>{rule.excerpt !== rule.title && <>: {rule.excerpt}</>}</p>
          ))}
        {flair !== undefined && (
          <p>{flair?.length ? <>Possible matching post flair: <strong>{flair.join(', ')}</strong>. Select the appropriate flair in Reddit.</>
            : 'Matching flair could not be verified. Check Reddit’s post flair picker.'}</p>
        )}
        {flair?.length && flairControl && !flairControl.disabled ? (
          <button type="button" className="moody-lens-btn-secondary" onClick={() => { if (isCurrent() && flairControl.isConnected) flairControl.click(); }}>Open Reddit flair picker</button>
        ) : null}
      </>}
      {repostText && (
        <details className="moody-lens-card">
          <summary>Context for this repost</summary>
          <CopyPreview text={repostText} label="Copy repost context" canCopy={isCurrent} />
        </details>
      )}
      <details className="moody-lens-card">
        <summary>Scan attachment</summary>
        {!supportedFile && <p>{files.length > 1 ? 'This check supports a single attachment.' : 'Select a supported attachment in Reddit (up to 12 MB). Some layouts do not expose the selected file.'}</p>}
        {supportedFile && <>
          <p>{supportedFile.name} ({Math.ceil(supportedFile.size / 1024)} KB) · Upload destination: {settings.apiUrl}</p>
          <p>Only the file will be uploaded; no draft text or filename is sent by Moody Lens.</p>
          {settings.localOnly ? <p>Local only is enabled. Uploads are disabled.</p> : <>
            {!confirmUpload && <button type="button" className="moody-lens-btn-secondary" onClick={() => setConfirmUpload(true)}>Review upload</button>}
            {confirmUpload && !needsConsent && <button type="button" className="moody-lens-btn-primary" disabled={busy} onClick={() => void scan()}>Upload and scan</button>}
            {needsConsent && <div className="moody-lens-actions">
              <button type="button" className="moody-lens-btn-secondary" onClick={() => void accept()}>Allow media uploads</button>
              <button type="button" className="moody-lens-btn-secondary" onClick={() => {
                setNeedsConsent(false); setConfirmUpload(false); setStatus('Upload declined. No media was sent.');
              }}>Not now</button>
            </div>}
          </>}
        </>}
        <p role="status">{status}</p>
      </details>
      {subreddit && <details className="moody-lens-card">
        <summary>Prepare your disclosure</summary>
        <p>Use wording that accurately describes how you made the media. Reddit’s rules and your statement are separate from the scan.</p>
        <label>Disclosure wording
          <select className="moody-lens-text-preview" value={disclosure} onChange={(event) => { setDisclosure(event.target.value); setPrepared(''); }}>
            <option value="">Choose wording</option>
            <option>AI-generated {postType === 'video' ? 'video' : 'image'}</option>
            <option>AI-assisted editing</option>
            <option>Contains synthetic audio</option>
          </select>
        </label>
        {disclosure && !prepared && <button type="button" className="moody-lens-btn-secondary" onClick={() => { if (isCurrent()) setPrepared(disclosure); }}>Confirm wording</button>}
        {prepared && <CopyPreview key={prepared} text={prepared} label="Copy disclosure" editable canCopy={isCurrent} />}
      </details>}
    </section>
  );
}
