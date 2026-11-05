/**
 * tests/unit/verdict-popover.test.tsx – Unit tests for VerdictPopover component.
 *
 * Verifies that the DEMO DATA badge renders when mock === true and is omitted
 * when mock is false or undefined.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { VerdictPopover } from '../../src/ui/VerdictPopover';
import type { DetectionJob } from '../../src/core/schema';

describe('VerdictPopover Component', () => {
  it('renders DEMO DATA badge when job.mock is true', () => {
    const job: DetectionJob = {
      job_id: 'job-demo-1',
      status: 'completed',
      overall_score: 0.85,
      label: 'likely_fake',
      mock: true,
      created_at: '2026-11-02T10:00:00Z',
      updated_at: '2026-11-02T10:01:00Z',
    };

    const html = renderToString(
      <VerdictPopover isOpen={true} isLoading={false} job={job} onClose={() => {}} />,
    );

    expect(html).toContain('DEMO DATA');
    expect(html).toContain('moody-lens-demo-badge');
  });

  it('does not render DEMO DATA badge when job.mock is false or omitted', () => {
    const job: DetectionJob = {
      job_id: 'job-real-1',
      status: 'completed',
      overall_score: 0.15,
      label: 'likely_real',
      mock: false,
      created_at: '2026-11-02T10:00:00Z',
      updated_at: '2026-11-02T10:01:00Z',
    };

    const html = renderToString(
      <VerdictPopover isOpen={true} isLoading={false} job={job} onClose={() => {}} />,
    );

    expect(html).not.toContain('DEMO DATA');
    expect(html).not.toContain('moody-lens-demo-badge');
  });
});
