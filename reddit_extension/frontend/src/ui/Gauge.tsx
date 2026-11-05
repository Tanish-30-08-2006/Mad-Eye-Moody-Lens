/**
 * ui/Gauge.tsx – Circular gauge for the manipulation probability (0 = authentic, 1 = manipulated).
 */

import React, { useId } from 'react';
import { percent } from '../core/verdict';

export interface GaugeProps {
  score: number; // 0.0 to 1.0
  label?: string;
}

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const Gauge: React.FC<GaugeProps> = ({ score, label = 'Manipulation probability' }) => {
  const gradientId = useId();
  const pct = percent(score);

  return (
    <div
      className="moody-lens-gauge"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <svg viewBox="0 0 132 132" width="132" height="132" aria-hidden="true" focusable="false">
        <defs>
          {/* Orange start, verdict-coloured end (the verdict colour comes from CSS). */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" className="moody-lens-gauge-stop-start" />
            <stop offset="100%" className="moody-lens-gauge-stop-end" />
          </linearGradient>
        </defs>
        <circle className="moody-lens-gauge-track" cx="66" cy="66" r={RADIUS} fill="none" strokeWidth="10" />
        <circle
          className="moody-lens-gauge-arc"
          cx="66"
          cy="66"
          r={RADIUS}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke={`url(#${gradientId})`}
          strokeDasharray={`${(CIRCUMFERENCE * pct) / 100} ${CIRCUMFERENCE}`}
          transform="rotate(-90 66 66)"
        />
      </svg>
      <span className="moody-lens-gauge-value">{pct}%</span>
    </div>
  );
};
