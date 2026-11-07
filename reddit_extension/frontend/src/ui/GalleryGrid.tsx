/**
 * ui/GalleryGrid.tsx – Numbered chips (verdict dot + score) for the images of a gallery scan.
 */

import React from 'react';
import type { BatchItem } from '../core/schema';
import { VERDICT_TEXT, percent, verdictOf, type Thresholds } from '../core/verdict';

export interface GalleryGridProps {
  items: BatchItem[];
  thresholds: Thresholds;
  /** Index of the focused image; null = the overall result. */
  selected: number | null;
  onSelect: (index: number | null) => void;
}

export const GalleryGrid: React.FC<GalleryGridProps> = ({ items, thresholds, selected, onSelect }) => (
  <div className="moody-lens-gallery">
    <h4 className="moody-lens-section-title">{items.length} images</h4>
    <div className="moody-lens-gallery-grid" role="group" aria-label="Images in this gallery">
      {items.map((item) => {
        const verdict = item.status === 'completed' ? verdictOf(item, thresholds) : null;
        const text = verdict ? VERDICT_TEXT[verdict] : 'failed';
        const score = typeof item.overall_score === 'number' ? `${percent(item.overall_score)}%` : '—';
        return (
          <button
            key={item.index}
            type="button"
            className="moody-lens-chip"
            data-verdict={verdict ?? 'error'}
            aria-pressed={selected === item.index}
            aria-label={`Image ${item.index + 1}: ${text}${score === '—' ? '' : `, ${score}`}`}
            onClick={() => onSelect(selected === item.index ? null : item.index)}
          >
            <span className="moody-lens-chip-dot" aria-hidden="true" />
            <span className="moody-lens-chip-num">{item.index + 1}</span>
            <span className="moody-lens-chip-score">{score}</span>
          </button>
        );
      })}
    </div>
  </div>
);
