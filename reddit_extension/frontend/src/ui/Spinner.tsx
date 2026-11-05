/**
 * ui/Spinner.tsx – Animated loading spinner shown while a scan runs.
 */

import React from 'react';

export interface SpinnerProps {
  label?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ label = 'Analyzing media...' }) => (
  <div className="moody-lens-spinner-container" role="status" aria-live="polite">
    <div className="moody-lens-spinner" aria-hidden="true" />
    {label && <span className="moody-lens-spinner-text">{label}</span>}
  </div>
);
