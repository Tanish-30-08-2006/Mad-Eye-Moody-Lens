import React, { useRef, useState } from 'react';
import { copyText } from './share';

export function CopyPreview({ text, label, permalink, canCopy, editable, children }: {
  text: string;
  label: string;
  permalink?: string;
  canCopy?: () => boolean;
  editable?: boolean;
  children?: React.ReactNode;
}) {
  const [status, setStatus] = useState('');
  const [manual, setManual] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const preview = useRef<HTMLTextAreaElement>(null);
  const fallback = useRef<HTMLTextAreaElement>(null);
  const value = draft ?? text;
  const copy = async (contents: string, linkOnly = false) => {
    if (!linkOnly && canCopy && !canCopy()) {
      setStatus('The media changed. Reopen the Lens and scan again before copying evidence.');
      return;
    }
    const ok = await copyText(contents);
    setStatus(ok ? 'Copied.' : 'Clipboard unavailable. Select and copy the text manually.');
    setManual(!ok && linkOnly ? contents : '');
    if (!ok) {
      requestAnimationFrame(() => {
        const field = linkOnly ? fallback.current : preview.current;
        field?.focus();
        field?.select();
      });
    }
  };
  return (
    <>
      {children}
      <textarea
        className="moody-lens-text-preview"
        ref={preview}
        aria-label={label + ' preview'}
        rows={4}
        readOnly={!editable}
        value={value}
        onChange={editable ? (event) => setDraft(event.target.value) : undefined}
      />
      <div className="moody-lens-actions">
        <button type="button" className="moody-lens-btn-secondary" onClick={() => void copy(value)}>{label}</button>
        {permalink && <button type="button" className="moody-lens-btn-secondary" onClick={() => void copy(permalink, true)}>Copy permalink</button>}
        {editable && draft !== null && <button type="button" className="moody-lens-btn-secondary" onClick={() => setDraft(null)}>Reset note</button>}
      </div>
      {manual && <textarea className="moody-lens-text-preview" ref={fallback} rows={2} aria-label="Permalink" value={manual} readOnly />}
      <p role="status" className="moody-lens-note">{status}</p>
    </>
  );
}
