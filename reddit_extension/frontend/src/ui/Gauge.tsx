/**
 * ui/Gauge.tsx – Linear gauge for the overall manipulation probability (0 = real, 1 = fake).
 */

import React from 'react';

export interface GaugeProps {
  score: number; // 0.0 to 1.0
  label?: string;
}

/** Colour band for a 0-100 percentage. */
export function gaugeBand(percentage: number): 'gauge-real' | 'gauge-inconclusive' | 'gauge-fake' {
  if (percentage < 35) return 'gauge-real';
  if (percentage < 65) return 'gauge-inconclusive';
  return 'gauge-fake';
}

export const Gauge: React.FC<GaugeProps> = ({ score, label = 'Manipulation probability' }) => {
  const percentage = Math.min(100, Math.max(0, Math.round(score * 100)));
  const band = gaugeBand(percentage);

  return (
    <div className="moody-lens-gauge">
      <div className="moody-lens-gauge-header">
        <span className="moody-lens-gauge-label">{label}</span>
        <span className={`moody-lens-gauge-value ${band}`}>{percentage}%</span>
      </div>
      <div
        className="moody-lens-gauge-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
      >
        <div className={`moody-lens-gauge-fill ${band}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
};
