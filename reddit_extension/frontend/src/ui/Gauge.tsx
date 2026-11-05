/**
 * ui/Gauge.tsx – Radial or linear confidence score gauge.
 *
 * Visually displays probability scores from 0.0 to 1.0 (Real -> Fake).
 *
 * TODO: Animate transitions and add color thresholds in Phase 5.
 */

import React from 'react';

export interface GaugeProps {
  score: number; // 0.0 to 1.0
  label?: string;
}

export const Gauge: React.FC<GaugeProps> = ({ score, label = 'Manipulation Probability' }) => {
  const percentage = Math.min(100, Math.max(0, Math.round(score * 100)));

  const getColorClass = (val: number) => {
    if (val < 35) return 'gauge-real';
    if (val < 65) return 'gauge-inconclusive';
    return 'gauge-fake';
  };

  return (
    <div className="moody-lens-gauge">
      <div className="moody-lens-gauge-header">
        <span className="moody-lens-gauge-label">{label}</span>
        <span className={`moody-lens-gauge-value ${getColorClass(percentage)}`}>
          {percentage}%
        </span>
      </div>
      <div className="moody-lens-gauge-track">
        <div
          className={`moody-lens-gauge-fill ${getColorClass(percentage)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
