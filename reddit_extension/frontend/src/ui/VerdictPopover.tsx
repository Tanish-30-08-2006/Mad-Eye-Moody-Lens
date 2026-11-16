/**
 * ui/VerdictPopover.tsx – The single shared popover: loading, result, local-only hints, error (with retry) and consent.
 *
 * Presentational only; popover-host.tsx owns positioning and the close triggers. Focus stays inside
 * the dialog (Tab wraps), Esc is handled by the host.
 */

import React, { useEffect, useRef } from 'react';
import type { DetectionJob, FeedbackLabel } from '../core/schema';
import type { ProvenanceHint, ScanMeta } from '../core/scan-meta';
import { DEFAULT_THRESHOLDS, DISCLAIMER, type Thresholds, type Verdict } from '../core/verdict';
import { Hints } from './Signals';
import { ResultView, type ResultContext } from './ResultView';
import { Spinner } from './Spinner';
import { AlertIcon, CloseIcon, InfoIcon, LensIcon } from './icons';
import type { PostDetails, PostSource } from '../core/reddit-context';
import { contextText, searchLinks, SEARCH_NOTE } from './share';
import { CopyPreview } from './CopyPreview';
import { authorTitleDisclosure } from '../adapters/reddit/disclosure';

export type PopoverView = (
  | { kind: 'ready' }
  | { kind: 'loading' }
  | { kind: 'result'; job: DetectionJob; meta?: ScanMeta; thresholds?: Thresholds; context?: ResultContext }
  | { kind: 'local'; hints: ProvenanceHint[] }
  | { kind: 'error'; message: string; code?: string }
) & { source?: PostSource; imageUrl?: string; postKey?: string; openShare?: boolean };

export interface VerdictPopoverProps {
  view: PopoverView;
  onClose: () => void;
  onRetry?: () => void;
  onAcceptConsent?: () => void;
  canCopyEvidence?: () => boolean;
  onFeedback?: (f: { cacheKey: string; verdict: Verdict; label: FeedbackLabel }) => Promise<boolean>;
  /** Viewport position (px) of the popover's top-left corner. */
  position?: { top: number; left: number };
  /** Plays the closing animation (set by the host while it waits to unmount). */
  closing?: boolean;
}

const FOCUSABLE = 'button:not([disabled]), textarea, a[href], summary, [tabindex]:not([tabindex="-1"])';

export const VerdictPopover: React.FC<VerdictPopoverProps> = ({ view, onClose, onRetry, onAcceptConsent, canCopyEvidence, onFeedback, position, closing }) => {
  const ref = useRef<HTMLDivElement>(null);

  // Move focus into the dialog when it opens so keyboard users land inside it.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  // Keep Tab / Shift+Tab cycling inside the dialog.
  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !ref.current) return;
    const focusable = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((element) => element.matches('summary') || !element.closest('details:not([open])'));
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = (ref.current.getRootNode() as Document | ShadowRoot).activeElement;
    if (event.shiftKey && (active === first || active === ref.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const showsResult = view.kind === 'result' || view.kind === 'local';
  const mock = view.kind === 'result' && view.job.mock === true;

  return (
    <div
      ref={ref}
      className="moody-lens-popover"
      role="dialog"
      aria-label="Moody Lens verdict"
      aria-modal="false"
      tabIndex={-1}
      data-closing={closing ? 'true' : undefined}
      data-mock={mock ? 'true' : undefined}
      style={position ? { top: position.top, left: position.left } : undefined}
      onKeyDown={trapFocus}
    >
      <div className="moody-lens-popover-header">
        <span className="moody-lens-logo" aria-hidden="true">
          <LensIcon size={16} />
        </span>
        <h3 className="moody-lens-popover-title">Moody Lens</h3>
        <button type="button" className="moody-lens-popover-close" onClick={onClose} aria-label="Close" data-tip="Close">
          <CloseIcon size={16} />
        </button>
      </div>

      <div className="moody-lens-popover-content">
        {view.source && <Provenance source={view.source} />}
        {view.source?.current.permalink && (
          <details key={view.openShare ? 'native' : 'lens'} className="moody-lens-card moody-lens-provenance" open={view.openShare || undefined}>
            <summary>Copy with context</summary>
            <CopyPreview
              text={contextText(view.source, view.kind === 'result' ? view.job : undefined, view.kind === 'result' ? view.meta : undefined, view.kind === 'result' ? view.thresholds : undefined)}
              label="Copy with context"
              permalink={view.source.current.permalink}
              canCopy={canCopyEvidence}
            />
          </details>
        )}
        {view.kind === 'ready' && onRetry && (
          <button type="button" className="moody-lens-btn-primary" onClick={onRetry}>Scan media</button>
        )}
        {view.kind !== 'result' && view.imageUrl && (
          <details className="moody-lens-card">
            <summary>Find source</summary>
            <p className="moody-lens-note">{SEARCH_NOTE}</p>
            {searchLinks(view.imageUrl).map((link) => (
              <p key={link.id}><a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a></p>
            ))}
          </details>
        )}
        {view.kind === 'loading' && <Spinner label="Analyzing media..." />}

        {view.kind === 'error' && view.code === 'CONSENT_REQUIRED' && (
          <div className="moody-lens-consent moody-lens-card" role="alert">
            <p className="moody-lens-card-title">
              <InfoIcon size={18} /> Before your first scan
            </p>
            <p>{view.message}</p>
            <p>If you agree, the post&apos;s image or video is uploaded to the backend set in Options for analysis.</p>
            <div className="moody-lens-actions">
              {onAcceptConsent && (
                <button type="button" className="moody-lens-btn-primary" onClick={onAcceptConsent}>
                  I agree
                </button>
              )}
              <button type="button" className="moody-lens-btn-secondary" onClick={onClose}>
                Not now
              </button>
            </div>
          </div>
        )}

        {view.kind === 'error' && view.code !== 'CONSENT_REQUIRED' && (
          <div className="moody-lens-error-banner moody-lens-card" role="alert">
            <p className="moody-lens-card-title">
              <AlertIcon size={18} /> Couldn&apos;t finish the scan
            </p>
            <p className="moody-lens-error-text">{view.message}</p>
            {onRetry && (
              <div className="moody-lens-actions">
                <button type="button" className="moody-lens-btn-primary" onClick={onRetry}>
                  Retry
                </button>
              </div>
            )}
          </div>
        )}

        {view.kind === 'local' && (
          <div className="moody-lens-verdict-details">
            <p className="moody-lens-card-title">
              <InfoIcon size={18} /> Local scan only
            </p>
            <p className="moody-lens-note">Nothing was uploaded. Only the file&apos;s metadata was checked, so there is no verdict.</p>
            <Hints hints={view.hints} alwaysShow />
          </div>
        )}

        {view.kind === 'result' && (
          <ResultView
            job={view.job}
            meta={view.meta}
            thresholds={view.thresholds ?? DEFAULT_THRESHOLDS}
            context={view.context ?? {}}
            paletteRoot={ref}
            onFeedback={onFeedback}
          />
        )}
      </div>

      {showsResult && <div className="moody-lens-disclaimer">{DISCLAIMER}</div>}
    </div>
  );
};

function OriginalLink({ post, children }: { post: PostDetails; children: React.ReactNode }) {
  return post.permalink ? <a href={post.permalink} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
}

function Provenance({ source }: { source: PostSource }) {
  const original = source.originals.at(-1);
  const changed = original?.title && source.current.title && original.title !== source.current.title;
  if (!original && !source.possible && !source.current.flair) return null;
  return (
    <section className="moody-lens-card moody-lens-provenance" aria-label="Post context">
      {source.current.flair && <p>Current post flair: {source.current.flair}</p>}
      {original && <>
        <p className="moody-lens-card-title"><OriginalLink post={original}>Original post</OriginalLink></p>
        {changed && <p><strong>Title changed</strong></p>}
        {source.current.title && <p><strong>Current title:</strong> {source.current.title}</p>}
        {original.title && <p><strong>Original title:</strong> {original.title}</p>}
        {authorTitleDisclosure(original.title) && <p>Original author’s title label: {authorTitleDisclosure(original.title)}</p>}
        {(original.subreddit || original.date) && <p>{[original.subreddit && 'r/' + original.subreddit, original.date?.slice(0, 10)].filter(Boolean).join(' · ')}</p>}
        {original.flair && <p>Original post flair: {original.flair}</p>}
        {original.unavailable && <p className="moody-lens-note">Original post details unavailable.</p>}
        {source.originals.slice(0, -1).map((post, index) => (
          <p key={index}><OriginalLink post={post}>Intermediate repost{post.title ? ': ' + post.title : ''}</OriginalLink>
            {post.flair && <> · Post flair: {post.flair}</>}</p>
        ))}
      </>}
      {source.possible && <>
        <p className="moody-lens-card-title"><OriginalLink post={source.possible}>Possible earlier match</OriginalLink></p>
        <p className="moody-lens-note">Exact image bytes observed earlier on this device. This does not establish authorship or when the image first appeared.</p>
      </>}
    </section>
  );
}
