/**
 * tests/unit/schema.test.ts – Unit tests for Zod API contract schemas.
 *
 * Verifies that DetectionJobSchema, DetectResponseSchema, and HealthResponseSchema
 * correctly parse and validate expected API contract payloads from both the real
 * backend and mock server.
 */

import { describe, it, expect } from 'vitest';
import {
  DetectionJobSchema,
  DetectResponseSchema,
  HealthResponseSchema,
  ApiErrorSchema,
} from '../../src/core/schema';

describe('API Contract Zod Schemas', () => {
  it('validates a valid HealthResponse', () => {
    const payload = {
      status: 'ok',
      version: '1.0.0',
      models_available: ['image', 'face', 'audio', 'video'],
    };

    const parsed = HealthResponseSchema.parse(payload);
    expect(parsed.status).toBe('ok');
    expect(parsed.models_available).toHaveLength(4);
  });

  it('validates a valid DetectResponse', () => {
    const payload = { job_id: 'job-5d4d8c18424c4187bec45f3f65958f50' };
    const parsed = DetectResponseSchema.parse(payload);
    expect(parsed.job_id).toBe('job-5d4d8c18424c4187bec45f3f65958f50');
  });

  it('validates a completed DetectionJob from real backend', () => {
    const realBackendPayload = {
      job_id: 'job-5d4d8c18424c4187bec45f3f65958f50',
      status: 'completed',
      overall_score: 0.9,
      label: 'likely_fake',
      models: {
        image: { score: 0.9, label: 'fake', confidence: 0.8 },
        face: { score: 0.8, label: 'fake', confidence: 0.6 },
        audio: null,
      },
      model_versions: {
        'Organika/sdxl-detector': 'stub',
        'Xicor9/efficientnet-b0-ffpp-c23': 'stub',
      },
      error: null,
      created_at: '2026-11-03T01:22:17.697287+00:00',
      updated_at: '2026-11-03T01:22:17.946827+00:00',
    };

    const parsed = DetectionJobSchema.parse(realBackendPayload);
    expect(parsed.status).toBe('completed');
    expect(parsed.label).toBe('likely_fake');
    expect(parsed.overall_score).toBe(0.9);
    expect(parsed.models?.image?.score).toBe(0.9);
  });

  it('validates a completed DetectionJob from mock server', () => {
    const mockServerPayload = {
      job_id: 'job_1730592000000_abcde',
      status: 'completed',
      overall_score: 0.12,
      label: 'likely_real',
      models: {
        image: { score: 0.12, label: 'real', confidence: 0.94 },
      },
      model_versions: {
        image: '1.0.0',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const parsed = DetectionJobSchema.parse(mockServerPayload);
    expect(parsed.status).toBe('completed');
    expect(parsed.label).toBe('likely_real');
    expect(parsed.overall_score).toBe(0.12);
    expect(parsed.models?.image?.confidence).toBe(0.94);
  });

  it('validates a structured ApiError', () => {
    const payload = {
      error: 'Media upload exceeds 20MB limit',
      code: 'FILE_TOO_LARGE',
    };

    const parsed = ApiErrorSchema.parse(payload);
    expect(parsed.error).toContain('20MB');
    expect(parsed.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects invalid job status values', () => {
    const invalidPayload = {
      job_id: 'job_invalid',
      status: 'non_existent_status',
      created_at: '2026-11-02',
      updated_at: '2026-11-02',
    };

    expect(() => DetectionJobSchema.parse(invalidPayload)).toThrow();
  });
});
