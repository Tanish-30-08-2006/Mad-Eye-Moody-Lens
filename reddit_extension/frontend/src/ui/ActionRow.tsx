/**
 * ui/ActionRow.tsx – Icon buttons under a result: copy, comment, card, report, find source, feedback.
 *
 * Every button is user-initiated and nothing is posted anywhere. Find source only reveals links; nothing
 * is opened (and no URL is sent anywhere) until the user clicks one.
 */

import React, { useState } from 'react';
import type { FeedbackLabel } from '../core/schema';
import { AlertIcon, CardIcon, CopyIcon, FlagIcon, SearchIcon, ShareIcon, ThumbDownIcon, ThumbUpIcon } from './icons';
import {
  SEARCH_NOTE,
  copyText,
  createCardBlob,
  downloadBlob,
  modReportText,
  readPalette,
  redditComment,
  searchLinks,
  summaryText,
  type ShareData,
} from './share';

export interface ActionRowProps {
  data: ShareData;
  /** Image URL for reverse search; omitted for videos. */
  sourceUrl?: string;
  /** Element whose CSS variables colour the card (inside the shadow root). */
  paletteRoot: React.RefObject<HTMLElement | null>;
  /** Present when the result has a cache key to attach feedback to. */
  onFeedback?: (label: FeedbackLabel) => Promise<boolean>;
}

type FeedbackState = 'idle' | 'sending' | FeedbackLabel | 'error';

const IconButton: React.FC<{
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
  disabled?: boolean;
}> = ({ label, onClick, children, pressed, disabled }) => (
  <button
    type="button"
    className="moody-lens-icon-btn"
    aria-label={label}
    data-tip={label}
    aria-pressed={pressed}
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </button>
);

export const ActionRow: React.FC<ActionRowProps> = ({ data, sourceUrl, paletteRoot, onFeedback }) => {
  const [toast, setToast] = useState('');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>('idle');

  const copy = async (text: string, done: string) => {
    setToast((await copyText(text)) ? done : "Couldn't copy to the clipboard.");
  };

  const downloadCard = async () => {
    const root = paletteRoot.current;
    const blob = root ? await createCardBlob(data, readPalette(root, data.verdict, data.mock)) : null;
    if (!blob) {
      setToast("Couldn't create the card.");
      return;
    }
    downloadBlob(blob, 'moody-lens-result.png');
    setToast('Card downloaded.');
  };

  const sendFeedback = async (label: FeedbackLabel) => {
    if (!onFeedback || feedback === 'sending') return;
    setFeedback('sending');
    setFeedback((await onFeedback(label)) ? label : 'error');
  };

  const answered = feedback === 'looks_right' || feedback === 'looks_wrong';

  return (
    <div className="moody-lens-actions-area">
      <div className="moody-lens-action-row" role="group" aria-label="Share and feedback">
        <IconButton label="Copy summary" onClick={() => void copy(summaryText(data), 'Summary copied.')}>
          <CopyIcon />
        </IconButton>
        <IconButton label="Copy as Reddit comment" onClick={() => void copy(redditComment(data), 'Comment copied.')}>
          <ShareIcon />
        </IconButton>
        <IconButton label="Download result card" onClick={() => void downloadCard()}>
          <CardIcon />
        </IconButton>
        <IconButton label="Copy report to mods" onClick={() => void copy(modReportText(data), 'Report text copied.')}>
          <FlagIcon />
        </IconButton>
        {sourceUrl && (
          <IconButton label="Find source" pressed={sourcesOpen} onClick={() => setSourcesOpen((open) => !open)}>
            <SearchIcon />
          </IconButton>
        )}
        <span className="moody-lens-action-spacer" />
        <IconButton
          label="Looks right"
          pressed={feedback === 'looks_right'}
          disabled={!onFeedback || answered || feedback === 'sending'}
          onClick={() => void sendFeedback('looks_right')}
        >
          <ThumbUpIcon />
        </IconButton>
        <IconButton
          label="Looks wrong"
          pressed={feedback === 'looks_wrong'}
          disabled={!onFeedback || answered || feedback === 'sending'}
          onClick={() => void sendFeedback('looks_wrong')}
        >
          <ThumbDownIcon />
        </IconButton>
      </div>

      {sourcesOpen && sourceUrl && (
        <div className="moody-lens-sources">
          <p className="moody-lens-note">{SEARCH_NOTE}</p>
          <div className="moody-lens-source-links">
            {searchLinks(sourceUrl).map((link) => (
              <a key={link.id} href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="moody-lens-toast" role="status" aria-live="polite">
        {answered && 'Thanks, feedback sent.'}
        {feedback === 'error' && (
          <>
            <AlertIcon size={14} /> Couldn&apos;t send feedback.
          </>
        )}
        {!answered && feedback !== 'error' && toast}
      </div>
    </div>
  );
};
