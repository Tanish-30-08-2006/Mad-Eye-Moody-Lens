/**
 * ui/VerdictPopover.tsx – Shared React Popover component displaying scan results.
 *
 * Single instance mounted in document body, positioned dynamically relative
 * to whichever post lens button was clicked.
 *
 * TODO: Implement positioning logic, close triggers, and transitions in Phase 5.
 */

import React from 'react';
import { Spinner } from './Spinner';
import { Gauge } from './Gauge';
import { ModelBreakdown } from './ModelBreakdown';
import type { DetectionJob } from '../core/schema';

export interface VerdictPopoverProps {
  isOpen: boolean;
  isLoading: boolean;
  error?: string | null;
  job?: DetectionJob | null;
  onClose: () => void;
}

export const VerdictPopover: React.FC<VerdictPopoverProps> = ({
  isOpen,
  isLoading,
  error,
  job,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="moody-lens-popover" role="dialog" aria-modal="true">
      <div className="moody-lens-popover-header">
        <h3 className="moody-lens-popover-title">Moody Lens Verdict</h3>
        <button
          type="button"
          className="moody-lens-popover-close"
          onClick={onClose}
          aria-label="Close popover"
        >
          ×
        </button>
      </div>

      <div className="moody-lens-popover-content">
        {isLoading && <Spinner label="Analyzing post media..." />}

        {error && (
          <div className="moody-lens-error-banner" role="alert">
            <p className="moody-lens-error-text">{error}</p>
          </div>
        )}

        {!isLoading && !error && job && (
          <div className="moody-lens-verdict-details">
            {job.mock && (
              <div className="moody-lens-demo-badge" data-testid="demo-data-badge">
                DEMO DATA
              </div>
            )}
            <div className={`moody-lens-verdict-badge label-${job.label ?? 'inconclusive'}`}>
              {job.label ? job.label.replace('_', ' ').toUpperCase() : 'INCONCLUSIVE'}
            </div>

            {typeof job.overall_score === 'number' && (
              <Gauge score={job.overall_score} />
            )}

            {job.models && <ModelBreakdown models={job.models} />}

            <div className="moody-lens-disclaimer">
              <small>
                Automated AI analysis. Results are probabilistic and should be verified independently.
              </small>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
