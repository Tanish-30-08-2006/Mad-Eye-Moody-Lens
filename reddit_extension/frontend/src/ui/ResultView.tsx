/**
 * ui/ResultView.tsx – The result body: gauge, verdict, notes, gallery chips, model rows, timeline, signals, hints, actions.
 */

import React, { useState } from 'react';
import type { BatchItem, DetectionJob, FeedbackLabel } from '../core/schema';
import type { ScanMeta } from '../core/scan-meta';
import { VERDICT_TEXT, verdictOf, type Thresholds, type Verdict } from '../core/verdict';
import { ActionRow } from './ActionRow';
import { Gauge } from './Gauge';
import { GalleryGrid } from './GalleryGrid';
import { Hints, Signals } from './Signals';
import { ModelBreakdown } from './ModelBreakdown';
import { Timeline } from './Timeline';
import { AlertIcon, CheckIcon, InfoIcon } from './icons';

export interface ResultContext {
  permalink?: string;
  mediaKind?: 'image' | 'gallery' | 'video' | 'gif';
  /** Image URLs for reverse search (one per gallery image). */
  sourceUrls?: string[];
  /** The author labelled the post as AI-made. */
  disclosedAi?: boolean;
}

export interface ResultViewProps {
  job: DetectionJob;
  meta?: ScanMeta;
  thresholds: Thresholds;
  context: ResultContext;
  paletteRoot: React.RefObject<HTMLElement | null>;
  onFeedback?: (f: { cacheKey: string; verdict: Verdict; label: FeedbackLabel }) => Promise<boolean>;
}

const VERDICT_ICON: Record<Verdict, React.ReactNode> = {
  likely_fake: <AlertIcon size={18} />,
  likely_real: <CheckIcon size={18} />,
  inconclusive: <InfoIcon size={18} />,
};

export const ResultView: React.FC<ResultViewProps> = ({ job, meta, thresholds, context, paletteRoot, onFeedback }) => {
  const [selected, setSelected] = useState<number | null>(null);
  const items = job.items && job.items.length > 1 ? job.items : null;

  // A focused gallery image replaces the headline fields; failed images fall back to the overall result.
  const item: BatchItem | undefined = selected !== null ? items?.find((i) => i.index === selected && i.status === 'completed') : undefined;
  const detail = item ?? job;
  const score = typeof detail.overall_score === 'number' ? detail.overall_score : null;
  const verdict = verdictOf(detail, thresholds);
  const mock = (item ? item.mock : job.mock) === true;
  const cacheKey = item?.cache_key ?? job.cache_key ?? undefined;
  const sourceUrl = context.mediaKind === 'video' || context.mediaKind === 'gif' ? undefined : context.sourceUrls?.[item ? item.index : 0];

  return (
    <div className="moody-lens-verdict-details" data-verdict={verdict} data-mock={mock}>
      <div className="moody-lens-badges">
        {mock && (
          <span className="moody-lens-demo-badge" data-testid="demo-data-badge">
            DEMO DATA
          </span>
        )}
        {context.disclosedAi && (
          <span className="moody-lens-disclosed" data-testid="disclosed-ai">
            <InfoIcon size={14} /> Disclosed as AI
          </span>
        )}
      </div>

      {score !== null && <Gauge score={score} />}
      <div className={`moody-lens-verdict-badge label-${verdict}`} data-verdict={verdict} aria-live="polite">
        {VERDICT_ICON[verdict]}
        <span>{VERDICT_TEXT[verdict]}</span>
      </div>
      {context.disclosedAi && (
        <p className="moody-lens-note">The author labelled this post as AI-made, so this is not a finding. The estimate above is the detector&apos;s view.</p>
      )}

      {meta?.audioNotScanned && <p className="moody-lens-note moody-lens-warn" data-testid="audio-note">Audio not scanned: only the video frames were analysed.</p>}
      {meta?.fromHashCache && <p className="moody-lens-note">Known media: answered from the backend&apos;s cache, nothing was uploaded.</p>}
      {meta?.galleryMissing ? <p className="moody-lens-note moody-lens-warn">{meta.galleryMissing} image(s) couldn&apos;t be loaded and were skipped.</p> : null}

      {items && <GalleryGrid items={items} thresholds={thresholds} selected={selected} onSelect={setSelected} />}
      {items && (
        <p className="moody-lens-note" aria-live="polite">
          {item ? `Showing image ${item.index + 1}.` : 'Showing the most suspicious image.'}
        </p>
      )}

      <ModelBreakdown models={detail.models} />
      {detail.timeline && detail.timeline.length > 0 && <Timeline points={detail.timeline} thresholds={thresholds} />}
      <Signals signals={detail.signals ?? []} />
      {meta?.hints && meta.hints.length > 0 && <Hints hints={meta.hints} />}

      <ActionRow
        data={{ score, verdict, mock, permalink: context.permalink, disclosedAi: context.disclosedAi }}
        sourceUrl={sourceUrl}
        paletteRoot={paletteRoot}
        onFeedback={onFeedback && cacheKey ? (label) => onFeedback({ cacheKey, verdict, label }) : undefined}
      />
    </div>
  );
};
