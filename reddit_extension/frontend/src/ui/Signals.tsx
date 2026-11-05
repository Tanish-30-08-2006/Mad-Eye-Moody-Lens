/**
 * ui/Signals.tsx – Collapsible "Why this score" list and provenance hints (both native <details>, keyboard friendly).
 */

import React from 'react';
import type { SignalEntry } from '../core/schema';
import type { ProvenanceHint } from '../core/scan-meta';
import { HINTS_NOTE } from '../core/hints';
import { ChevronIcon } from './icons';

export const Signals: React.FC<{ signals: SignalEntry[] }> = ({ signals }) => {
  if (signals.length === 0) return null;
  return (
    <details className="moody-lens-collapsible moody-lens-signals">
      <summary>
        <span>Why this score</span>
        <ChevronIcon size={16} />
      </summary>
      <ul>
        {signals.map((s, i) => (
          <li key={`${s.kind}-${i}`} data-severity={s.severity}>
            <span className="moody-lens-signal-dot" aria-hidden="true" />
            <span>{s.text}</span>
          </li>
        ))}
      </ul>
    </details>
  );
};

export const Hints: React.FC<{ hints: ProvenanceHint[]; alwaysShow?: boolean }> = ({ hints, alwaysShow }) => {
  if (hints.length === 0 && !alwaysShow) return null;
  return (
    <details className="moody-lens-collapsible moody-lens-hints" open={alwaysShow}>
      <summary>
        <span>{HINTS_NOTE}</span>
        <ChevronIcon size={16} />
      </summary>
      {hints.length === 0 ? (
        <p className="moody-lens-note">No provenance metadata found. Reddit often strips it, so this says little.</p>
      ) : (
        <ul>
          {hints.map((h) => (
            <li key={h.text}>
              <span className="moody-lens-signal-dot" aria-hidden="true" />
              <span>{h.text}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
};
