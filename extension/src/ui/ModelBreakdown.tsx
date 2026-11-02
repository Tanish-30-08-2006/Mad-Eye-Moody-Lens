/**
 * ui/ModelBreakdown.tsx – Tabular / list view of individual detector model outputs.
 *
 * Displays individual scores and confidences for image, face, and audio models.
 *
 * TODO: Add model version tags and explainability links in Phase 5.
 */

import React from 'react';
import type { ModelResult } from '../core/schema';

export interface ModelBreakdownProps {
  models?: {
    image?: ModelResult;
    face?: ModelResult;
    audio?: ModelResult;
  };
}

export const ModelBreakdown: React.FC<ModelBreakdownProps> = ({ models }) => {
  if (!models || Object.keys(models).length === 0) {
    return null;
  }

  const entries = Object.entries(models) as [string, ModelResult][];

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
