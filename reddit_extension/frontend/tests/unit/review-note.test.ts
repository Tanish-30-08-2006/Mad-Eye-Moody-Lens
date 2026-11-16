import { expect, it } from 'vitest';
import type { DetectionJob } from '../../src/core/schema';
import { reviewText } from '../../src/ui/ReviewNote';

const source = { current: { permalink: 'https://www.reddit.com/r/art/comments/abc/' }, originals: [] };
const models = { face: { score: 0.92, confidence: 0.8, label: 'fake' } };
const base: DetectionJob = {
  job_id: 'job', status: 'completed', mock: false, created_at: 'now', updated_at: 'now',
  overall_score: 0.92, models,
};

it('reports only the current item and keeps rule and provenance separate', () => {
  const note = reviewText(source, 'art',
    { state: 'result', job: { ...base, items: [
      { index: 0, status: 'failed', mock: false },
      { index: 2, status: 'completed', models, overall_score: 0.92, mock: false },
    ] }, meta: { exactScope: 'gallery', galleryMissing: 1 } },
    { subreddit: 'art', rules: [{ title: 'AI art', kind: 'flair', excerpt: 'AI art requires flair', media: 'image' }], flair: ['AI Art'] },
    'image',
  );
  expect(note).toContain('Gallery item 3 (face manipulation): flagged');
  expect(note).not.toContain('Gallery item 1 (');
  expect(note).toContain('/r/art/about/rules/');
  expect(note).toContain('Reviewer notes:');
});

it('only names actual flagged ranges on real video and indicates when audio was not checked', () => {
  const job = { ...base, timeline: [{ start: 2.125, end: 3.5, score: 0.9 }, { start: 5, end: 6, score: 0.1 }] };
  const meta = { exactScope: 'video' } as const;
  const note = reviewText(source, 'art', { state: 'result', job, meta });
  expect(note).toContain('2.125s to 3.5s');
  expect(note).toContain('No audio analysis result');
  expect(note).not.toContain('5s to 6s');
  for (const response of [{ ...job, timeline: [] }, { ...job, mock: true }, { ...job, mock: undefined }]) {
    expect(reviewText(source, 'art', { state: 'result', job: response, meta })).not.toContain('Detector flagged range');
  }
  expect(reviewText(source, 'art', { state: 'error' })).toContain('no verified real result');
});
