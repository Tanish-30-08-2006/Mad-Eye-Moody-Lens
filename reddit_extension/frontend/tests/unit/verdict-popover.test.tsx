// @vitest-environment happy-dom
/**
 * tests/unit/verdict-popover.test.tsx – Popover states: loading, result, null models, mock badge, error + retry, consent.
 * Label: RUNTIME (React + happy-dom).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { VerdictPopover } from '../../src/ui/VerdictPopover';
import type { DetectionJob } from '../../src/core/schema';
import { act, render, type Rendered } from '../helpers/react';

let current: Rendered | null = null;
afterEach(() => {
  current?.unmount();
  current = null;
});

const baseJob: DetectionJob = {
  job_id: 'job-1',
  status: 'completed',
  overall_score: 0.85,
  label: 'likely_fake',
  models: {
    image: { score: 0.9, label: 'fake', confidence: 0.8 },
    face: null,
  },
  created_at: '2026-11-02T10:00:00Z',
  updated_at: '2026-11-02T10:01:00Z',
};

describe('VerdictPopover', () => {
  it('shows a spinner while loading', async () => {
    current = await render(<VerdictPopover view={{ kind: 'loading' }} onClose={() => {}} />);
    expect(current.container.querySelector('.moody-lens-spinner')).not.toBeNull();
    expect(current.container.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('shows the gauge with the overall score and the verdict label', async () => {
    current = await render(<VerdictPopover view={{ kind: 'result', job: baseJob }} onClose={() => {}} />);
    expect(current.container.textContent).toContain('LIKELY FAKE');
    expect(current.container.textContent).toContain('85%');
    expect(current.container.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('85');
  });

  it('says "not run" for null or missing models and never invents a score', async () => {
    current = await render(<VerdictPopover view={{ kind: 'result', job: baseJob }} onClose={() => {}} />);
    expect(current.container.querySelector('[data-testid="model-image"]')?.textContent).toContain('90.0%');
    expect(current.container.querySelector('[data-testid="model-face"]')?.textContent).toContain('not run');
    expect(current.container.querySelector('[data-testid="model-audio"]')?.textContent).toContain('not run');
  });

  it('renders DEMO DATA only when job.mock is true', async () => {
    current = await render(<VerdictPopover view={{ kind: 'result', job: { ...baseJob, mock: true } }} onClose={() => {}} />);
    expect(current.container.textContent).toContain('DEMO DATA');
    current.unmount();
    current = await render(<VerdictPopover view={{ kind: 'result', job: { ...baseJob, mock: false } }} onClose={() => {}} />);
    expect(current.container.textContent).not.toContain('DEMO DATA');
    current.unmount();
    current = await render(<VerdictPopover view={{ kind: 'result', job: baseJob }} onClose={() => {}} />);
    expect(current.container.textContent).not.toContain('DEMO DATA');
  });

  it('shows the error with a working Retry button', async () => {
    const onRetry = vi.fn();
    current = await render(
      <VerdictPopover view={{ kind: 'error', message: 'Backend down', code: 'NETWORK_ERROR' }} onClose={() => {}} onRetry={onRetry} />,
    );
    expect(current.container.textContent).toContain('Backend down');
    const retry = Array.from(current.container.querySelectorAll('button')).find((b) => b.textContent === 'Retry')!;
    await act(async () => retry.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows the consent prompt for CONSENT_REQUIRED instead of Retry', async () => {
    const onAccept = vi.fn();
    current = await render(
      <VerdictPopover
        view={{ kind: 'error', message: 'Needs permission', code: 'CONSENT_REQUIRED' }}
        onClose={() => {}}
        onRetry={() => {}}
        onAcceptConsent={onAccept}
      />,
    );
    const buttons = Array.from(current.container.querySelectorAll('button')).map((b) => b.textContent);
    expect(buttons).toContain('I agree');
    expect(buttons).not.toContain('Retry');
    const agree = Array.from(current.container.querySelectorAll('button')).find((b) => b.textContent === 'I agree')!;
    await act(async () => agree.click());
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('close button calls onClose', async () => {
    const onClose = vi.fn();
    current = await render(<VerdictPopover view={{ kind: 'loading' }} onClose={onClose} />);
    await act(async () => (current!.container.querySelector('[aria-label="Close"]') as HTMLElement).click());
    expect(onClose).toHaveBeenCalled();
  });
});
