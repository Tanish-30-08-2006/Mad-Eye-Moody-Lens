/**
 * tests/unit/schema.test.ts – Unit tests for Zod API contract schemas.
 *
 * Verifies that DetectionJobSchema, DetectResponseSchema, and HealthResponseSchema
 * correctly parse and validate expected API contract payloads.
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
      models_available: ['hybrid_xception_vit', 'ssl_antispoof'],
    };

    const parsed = HealthResponseSchema.parse(payload);
    expect(parsed.status).toBe('ok');
    expect(parsed.models_available).toHaveLength(2);
  });

  it('validates a valid DetectResponse', () => {
    const payload = { job_id: 'job_test_123' };
    const parsed = DetectResponseSchema.parse(payload);
    expect(parsed.job_id).toBe('job_test_123');
  });

  it('validates a completed DetectionJob', () => {
    const payload = {
      job_id: 'job_test_456',
      status: 'completed',
      overall_score: 0.15,
      label: 'likely_real',
      models: {
        image: {
          score: 0.15,
          label: 'real',
          confidence: 0.92,
        },
      },
      model_versions: {
        image: '1.0.0',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const parsed = DetectionJobSchema.parse(payload);
    expect(parsed.status).toBe('completed');
    expect(parsed.label).toBe('likely_real');
    expect(parsed.overall_score).toBe(0.15);
    expect(parsed.models?.image?.confidence).toBe(0.92);
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
