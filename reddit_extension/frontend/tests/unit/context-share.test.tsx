// @vitest-environment happy-dom
import React from 'react';
import { expect, it, vi } from 'vitest';
import { act, render } from '../helpers/react';
import { contextText } from '../../src/ui/share';
import { CopyPreview } from '../../src/ui/CopyPreview';
import type { DetectionJob } from '../../src/core/schema';

const current = { permalink: 'https://www.reddit.com/r/test/comments/new/' };
const original = { permalink: 'https://www.reddit.com/r/art/comments/old/', title: '[AI-generated] Picture', flair: 'Satire' };
const source = { current, originals: [original] };
const real: DetectionJob = {
  job_id: 'job', created_at: 'now', updated_at: 'now', status: 'completed', mock: false,
  overall_score: 0.85, models: { audio: { score: 0.94, label: 'fake', confidence: 0.9 } },
};

it('attributes disclosures and includes only real evidence for the matching attachment', () => {
  const bare = contextText(source);
  expect(bare).toContain('Reddit-linked original: ' + original.permalink);
  expect(bare).toContain('author’s title label: [AI-generated]');
  expect(bare).toContain('post flair: Satire');
  expect(contextText(source, real, { exactScope: 'video' })).toContain('possible synthetic audio');
  expect(contextText(source, real)).toBe(bare);
  expect(contextText(source, { ...real, mock: true }, { exactScope: 'video' })).toBe(bare);
  expect(contextText(source, { ...real, status: 'failed' }, { exactScope: 'video' })).toBe(bare);
  expect(contextText(source, real, { exactScope: 'video', audioNotScanned: true })).toBe(bare);
});

it('leaves a selectable preview when both clipboard paths reject the copy', async () => {
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const setup = await render(<CopyPreview label="Copy with context" text="Source excerpt" permalink={current.permalink} />);
  try {
    await act(async () => setup.container.querySelector('button')!.click());
    expect(setup.container.querySelector('[role="status"]')?.textContent).toContain('manually');
    expect(setup.container.querySelector('textarea')?.value).toBe('Source excerpt');
  } finally {
    setup.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
