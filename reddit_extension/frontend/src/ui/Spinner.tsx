/**
 * ui/Spinner.tsx – Skeleton shimmer shown while a scan runs (the label is read out by screen readers).
 */

import React from 'react';

export interface SpinnerProps {
  label?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ label = 'Analyzing media...' }) => (
  <div className="moody-lens-spinner-container" role="status" aria-live="polite">
    <div className="moody-lens-spinner" aria-hidden="true">
      <span className="moody-lens-skeleton moody-lens-skeleton-circle" />
      <span className="moody-lens-skeleton moody-lens-skeleton-pill" />
      <span className="moody-lens-skeleton moody-lens-skeleton-line" />
      <span className="moody-lens-skeleton moody-lens-skeleton-line short" />
    </div>
    {label && <span className="moody-lens-spinner-text">{label}</span>}
  </div>
);
