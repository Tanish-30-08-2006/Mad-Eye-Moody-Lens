import React, { useEffect, useState } from 'react';
import { relevantRules, ruleLabel, rulesLink, type CommunityPolicy, type PostType } from '../core/community-policy';
import type { PostSource } from '../core/reddit-context';
import type { BatchItem, DetectionJob } from '../core/schema';
import type { ScanMeta } from '../core/scan-meta';
import { DEFAULT_THRESHOLDS, verdictForScore, verdictOf, type Thresholds } from '../core/verdict';
import { CopyPreview } from './CopyPreview';
import { sourceContext } from './share';

type Scan = {
  state: 'ready' | 'loading' | 'error' | 'local' | 'result';
  job?: DetectionJob;
  meta?: ScanMeta;
  thresholds?: Thresholds;
};

const checkNames = { image: 'image generation', face: 'face manipulation', audio: 'synthetic speech' } as const;
const checksRun = (result: DetectionJob | BatchItem) => (
  (Object.keys(checkNames) as (keyof typeof checkNames)[]).filter((key) => result.models?.[key]).map((key) => checkNames[key])
);
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
const seconds = (value: number) => String(Number(value.toFixed(3))) + 's';

export function reviewText(source: PostSource, subreddit: string, scan: Scan, policy?: CommunityPolicy | null, postType: PostType = 'unknown'): string {
  const lines = ['Moody Lens review note', 'Post: ' + source.current.permalink, 'Community: r/' + subreddit];
  const rules = policy?.subreddit === subreddit ? relevantRules(policy, postType) : null;
  if (rules?.length) {
    lines.push('Potentially relevant community rules: ' + rulesLink(subreddit));
    for (const rule of rules.slice(0, 3)) {
      lines.push('- ' + ruleLabel[rule.kind] + ' — ' + clean(rule.title) + (rule.title === rule.excerpt ? '' : ': ' + clean(rule.excerpt)));
    }
  } else {
    lines.push(rules ? 'No relevant rule found in the available rules.' : 'No community rule verified.');
  }
  lines.push(...sourceContext(source));
  if (source.originals.at(-1)?.unavailable) lines.push('Original post details unavailable.');
  if (source.possible) lines.push('Possible earlier image match (observed identical bytes; context and authorship unverified): ' + source.possible.permalink);

  const { job, meta, thresholds = DEFAULT_THRESHOLDS } = scan;
  if (scan.state === 'loading') lines.push('Scan: in progress.');
  else if (scan.state === 'ready') lines.push('Scan: not run.');
  else if (scan.state === 'local') lines.push('Scan: local file hints only; no inference verdict.');
  else if (job?.status !== 'completed' || job.mock !== false || !meta?.exactScope) {
    lines.push('Scan: no verified real result for this attachment.');
  } else if (meta.exactScope === 'gallery') {
    const items = job.items?.filter((item) => item.status === 'completed' && item.mock === false && checksRun(item).length) ?? [];
    const checked = items.map((item) => item.index + 1);
    if (items.length) {
      lines.push('Scan: gallery ' + (items.length === 1 ? 'item ' : 'items ') + checked.join(', ') + '.');
      for (const item of items) {
        const scope = 'Gallery item ' + (item.index + 1) + ' (' + checksRun(item).join(', ') + ')';
        const verdict = verdictOf(item, thresholds);
        const outcome = verdict === 'likely_fake' ? 'flagged for possible manipulation' : verdict === 'likely_real' ? 'no high signal' : 'inconclusive';
        lines.push(scope + ': ' + outcome + '.');
      }
      if (meta.galleryMissing) lines.push(meta.galleryMissing + ' gallery image(s) could not be loaded or were outside the scan limit.');
    } else lines.push('Scan: no verified per-item gallery finding.');
  } else {
    const video = meta.exactScope === 'video';
    const checks = checksRun(job).filter((check) => check !== checkNames.audio || !meta.audioNotScanned);
    lines.push('Scan: ' + (video ? 'video' : 'image') + (checks.length ? '; checks: ' + checks.join(', ') + '.' : '; checks unspecified.'));
    if (video && (!job.models?.audio || meta.audioNotScanned)) lines.push('No audio analysis result.');
    const verdict = verdictOf(job, thresholds);
    if (checks.length) lines.push('Detector estimate: ' + (verdict === 'likely_fake' ? 'possible manipulation' : verdict === 'likely_real' ? 'no high signal' : 'inconclusive') + '.');
    if (video) {
      const ranges = (job.timeline ?? []).filter((point) =>
        Number.isFinite(point.start) && Number.isFinite(point.end) && point.start >= 0 && point.end > point.start &&
        verdictForScore(point.score, thresholds) === 'likely_fake');
      for (const range of ranges.slice(0, 5)) lines.push('Detector flagged range: ' + seconds(range.start) + ' to ' + seconds(range.end) + '.');
    }
  }
  lines.push('Automated estimates and source observations are context for human review. They do not establish a rule violation.', '', 'Reviewer notes:');
  return lines.join('\n');
}

export function ReviewNote({ source, subreddit, postType, scan, loadPolicy, canCopy }: {
  source: PostSource;
  subreddit: string;
  postType: PostType;
  scan: Scan;
  loadPolicy?: () => Promise<CommunityPolicy | null>;
  canCopy?: () => boolean;
}) {
  const [opened, setOpened] = useState(false);
  const [policy, setPolicy] = useState<CommunityPolicy | null>(null);
  useEffect(() => {
    if (!opened || !loadPolicy) return;
    let alive = true;
    void loadPolicy().then((result) => {
      if (alive) setPolicy(result?.subreddit === subreddit ? result : null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [opened, loadPolicy, subreddit]);
  return (
    <details className="moody-lens-card moody-lens-provenance" onToggle={(event) => { if (event.currentTarget.open) setOpened(true); }}>
      <summary>Prepare review note</summary>
      <p className="moody-lens-note">Review and edit before copying. Nothing is sent to Reddit.</p>
      <CopyPreview text={reviewText(source, subreddit, scan, policy, postType)} label="Copy review note" editable canCopy={canCopy} />
    </details>
  );
}
