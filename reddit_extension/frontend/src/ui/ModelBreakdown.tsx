/**
 * ui/ModelBreakdown.tsx – Per-detector results; detectors that did not run say "not run".
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

const MODALITIES = ['image', 'face', 'audio'] as const;

export const ModelBreakdown: React.FC<ModelBreakdownProps> = ({ models }) => (
  <div className="moody-lens-model-breakdown">
    <h4 className="moody-lens-breakdown-title">Model breakdown</h4>
    <div className="moody-lens-breakdown-list">
      {MODALITIES.map((modality) => {
        const result = models?.[modality];
        // null/undefined means the detector did not run; never show a made-up score.
        if (!result) {
          return (
            <div key={modality} className="moody-lens-breakdown-item not-run" data-testid={`model-${modality}`}>
              <span className="moody-lens-breakdown-modality">{modality}</span>
              <span className="moody-lens-breakdown-label">not run</span>
            </div>
          );
        }
        return (
          <div key={modality} className="moody-lens-breakdown-item" data-testid={`model-${modality}`}>
            <span className="moody-lens-breakdown-modality">{modality}</span>
            <span className="moody-lens-breakdown-label">{result.label}</span>
            <span className="moody-lens-breakdown-score">{(result.score * 100).toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  </div>
);
