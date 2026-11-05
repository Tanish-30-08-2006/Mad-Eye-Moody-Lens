/**
 * ui/VerdictPopover.tsx – The single shared popover: loading, result, error (with retry) and consent.
 *
 * Presentational only; popover-host.tsx owns positioning and the close triggers.
 */

import React, { useEffect, useRef } from 'react';
import { Spinner } from './Spinner';
import { Gauge } from './Gauge';
import { ModelBreakdown } from './ModelBreakdown';
import type { DetectionJob } from '../core/schema';

export type PopoverView =
  | { kind: 'loading' }
  | { kind: 'result'; job: DetectionJob }
  | { kind: 'error'; message: string; code?: string };

export interface VerdictPopoverProps {
  view: PopoverView;
  onClose: () => void;
  onRetry?: () => void;
  onAcceptConsent?: () => void;
  /** Viewport position (px) of the popover's top-left corner. */
  position?: { top: number; left: number };
}

const LABEL_TEXT: Record<string, string> = {
  likely_real: 'LIKELY REAL',
  likely_fake: 'LIKELY FAKE',
  inconclusive: 'INCONCLUSIVE',
};

export const VerdictPopover: React.FC<VerdictPopoverProps> = ({
  view,
  onClose,
  onRetry,
  onAcceptConsent,
  position,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  // Move focus into the dialog when it opens so keyboard users land inside it.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      className="moody-lens-popover"
      role="dialog"
      aria-label="Moody Lens verdict"
      tabIndex={-1}
      style={position ? { top: position.top, left: position.left } : undefined}
    >
      <div className="moody-lens-popover-header">
        <h3 className="moody-lens-popover-title">Moody Lens</h3>
        <button type="button" className="moody-lens-popover-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="moody-lens-popover-content">
        {view.kind === 'loading' && <Spinner label="Analyzing media..." />}

        {view.kind === 'error' && view.code === 'CONSENT_REQUIRED' && (
          <div className="moody-lens-consent" role="alert">
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
          <div className="moody-lens-error-banner" role="alert">
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

        {view.kind === 'result' && (
          <div className="moody-lens-verdict-details">
            {view.job.mock && (
              <div className="moody-lens-demo-badge" data-testid="demo-data-badge">
                DEMO DATA
              </div>
            )}
            <div className={`moody-lens-verdict-badge label-${view.job.label ?? 'inconclusive'}`}>
              {LABEL_TEXT[view.job.label ?? 'inconclusive']}
            </div>
            {typeof view.job.overall_score === 'number' && <Gauge score={view.job.overall_score} />}
            <ModelBreakdown models={view.job.models} />
            <div className="moody-lens-disclaimer">
              Automated analysis. Results are probabilistic and should be verified independently.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
