/**
 * ui/ModelBreakdown.tsx – Tabular / list view of individual detector model outputs.
 *
 * Displays individual scores and confidences for image, face, and audio models.
 * Filters out unrun / null modalities.
 */

import React from 'react';
import type { ModelResult } from '../core/schema';

export interface ModelBreakdownProps {
  models?: {
    image?: ModelResult | null;
    face?: ModelResult | null;
    audio?: ModelResult | null;
  } | null;
}

export const ModelBreakdown: React.FC<ModelBreakdownProps> = ({ models }) => {
  if (!models || Object.keys(models).length === 0) {
    return null;
  }

  const entries = Object.entries(models).filter(
    ([, result]) => result != null,
  ) as [string, ModelResult][];

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="moody-lens-model-breakdown">
      <h4 className="moody-lens-breakdown-title">Model Breakdown</h4>
      <div className="moody-lens-breakdown-list">
        {entries.map(([modality, result]) => (
          <div key={modality} className="moody-lens-breakdown-item">
            <span className="moody-lens-breakdown-modality">{modality}</span>
            <span className="moody-lens-breakdown-label">{result.label}</span>
            <span className="moody-lens-breakdown-score">
              {(result.score * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
