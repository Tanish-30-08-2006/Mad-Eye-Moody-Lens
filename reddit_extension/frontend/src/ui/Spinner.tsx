/**
 * ui/Spinner.tsx – Animated loading spinner component for scanning state.
 *
 * Rendered within the VerdictPopover while detection models are actively inferring.
 *
 * TODO: Support custom dimensions and accessibility announcements in Phase 5.
 */

import React from 'react';

export interface SpinnerProps {
  size?: 'small' | 'medium' | 'large';
  label?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'medium',
  label = 'Analyzing media with Moody Lens...',
}) => {
  return (
    <div className={`moody-lens-spinner-container size-${size}`} role="status">
      <div className="moody-lens-spinner" aria-hidden="true" />
      {label && <span className="moody-lens-spinner-text">{label}</span>}
    </div>
  );
};
