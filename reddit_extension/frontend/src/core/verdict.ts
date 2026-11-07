/**
 * core/verdict.ts – Turns a score into a label on the client, using the user's sensitivity thresholds.
 *
 * Wording is probabilistic on purpose: nothing here says a post IS fake, only that it is likely so.
 */

import type { DetectionJob } from './schema';

export type Verdict = 'likely_real' | 'likely_fake' | 'inconclusive';

export interface Thresholds {
  /** Scores at or below this are "likely authentic". */
  realBelow: number;
  /** Scores at or above this are "likely manipulated". */
  fakeAbove: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { realBelow: 0.3, fakeAbove: 0.7 };

export const DISCLAIMER = 'Automated estimate, not proof';

export const VERDICT_TEXT: Record<Verdict, string> = {
  likely_fake: 'Likely manipulated',
  likely_real: 'Likely authentic',
  inconclusive: 'Inconclusive',
};

export function verdictForScore(score: number, t: Thresholds = DEFAULT_THRESHOLDS): Verdict {
  if (score >= t.fakeAbove) return 'likely_fake';
  if (score <= t.realBelow) return 'likely_real';
  return 'inconclusive';
}

/** Label for a job or batch item: computed from the score when there is one, else the backend's label. */
export function verdictOf(
  job: { overall_score?: number | null; label?: DetectionJob['label'] },
  t: Thresholds = DEFAULT_THRESHOLDS,
): Verdict {
  if (typeof job.overall_score === 'number') return verdictForScore(job.overall_score, t);
  return job.label ?? 'inconclusive';
}

export function percent(score: number): number {
  return Math.min(100, Math.max(0, Math.round(score * 100)));
}
