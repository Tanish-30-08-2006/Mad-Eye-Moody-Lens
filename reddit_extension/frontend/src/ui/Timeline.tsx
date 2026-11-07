/**
 * ui/Timeline.tsx – Slim bar chart of suspicion over a video's duration (rendered only when a timeline exists).
 */

import React from 'react';
import type { TimelineEntry } from '../core/schema';
import { percent, verdictForScore, type Thresholds, DEFAULT_THRESHOLDS } from '../core/verdict';

export interface TimelineProps {
  points: TimelineEntry[];
  thresholds?: Thresholds;
}

function clock(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const Timeline: React.FC<TimelineProps> = ({ points, thresholds = DEFAULT_THRESHOLDS }) => {
  if (points.length === 0) return null;
  const peak = points.reduce((a, b) => (b.score > a.score ? b : a));
  return (
    <div className="moody-lens-timeline">
      <h4 className="moody-lens-section-title">Video timeline</h4>
      <div
        className="moody-lens-timeline-bars"
        role="img"
        aria-label={`Suspicion over time. Highest ${percent(peak.score)}% at ${clock(peak.start)}.`}
      >
        {points.map((p) => (
          <span
            key={`${p.start}-${p.end}`}
            className="moody-lens-timeline-bar"
            data-verdict={verdictForScore(p.score, thresholds)}
            style={{ flex: Math.max(0.1, p.end - p.start), height: `${Math.max(8, percent(p.score))}%` }}
            title={`${clock(p.start)}–${clock(p.end)}: ${percent(p.score)}%`}
          />
        ))}
      </div>
      <div className="moody-lens-timeline-axis" aria-hidden="true">
        <span>{clock(points[0]!.start)}</span>
        <span>{clock(points[points.length - 1]!.end)}</span>
      </div>
    </div>
  );
};
