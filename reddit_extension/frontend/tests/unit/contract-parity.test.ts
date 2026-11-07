/**
 * tests/unit/contract-parity.test.ts – Contract parity tests.
 *
 * Proves that the extension mock server fixtures and the real backend
 * satisfy the exact SAME schema contract (Zod fixtures vs Pydantic schema).
 */

import { describe, it, expect } from 'vitest';
import {
  DetectionJobSchema,
  DetectResponseSchema,
  HealthResponseSchema,
} from '../../src/core/schema';

describe('Schema Contract Parity (Extension Mock Server vs Real Backend)', () => {
  it('validates mock server /api/v1/health payload against HealthResponseSchema', () => {
    // Exact response emitted by tests/mock-server/index.mjs
    const mockHealthPayload = {
      status: 'ok',
      version: '1.0.0-mock',
      models_available: ['hybrid_xception_vit', 'ssl_antispoof', 'video_frame'],
    };

    const parsed = HealthResponseSchema.parse(mockHealthPayload);
    expect(parsed.status).toBe('ok');
    expect(parsed.version).toBe('1.0.0-mock');
    expect(parsed.models_available).toContain('hybrid_xception_vit');
  });

  it('validates mock server /api/v1/detect response against DetectResponseSchema', () => {
    // Response emitted by tests/mock-server/index.mjs POST /api/v1/detect
    const mockDetectPayload = {
      job_id: 'job_1730592000000_abcde',
    };

    const parsed = DetectResponseSchema.parse(mockDetectPayload);
    expect(parsed.job_id).toBe('job_1730592000000_abcde');
  });

  it('validates mock server /api/v1/jobs/:id payload against DetectionJobSchema', () => {
    // Response stored and emitted by tests/mock-server/index.mjs
    const mockJobPayload = {
      job_id: 'job_1730592000000_abcde',
      status: 'completed',
      overall_score: 0.12,
      label: 'likely_real',
      models: {
        image: {
          score: 0.12,
          label: 'real',
          confidence: 0.94,
        },
      },
      model_versions: {
        image: '1.0.0',
      },
      mock: true,
      created_at: '2026-11-03T01:00:00.000Z',
      updated_at: '2026-11-03T01:00:01.000Z',
    };

    const parsed = DetectionJobSchema.parse(mockJobPayload);
    expect(parsed.job_id).toBe('job_1730592000000_abcde');
    expect(parsed.status).toBe('completed');
    expect(parsed.mock).toBe(true);
    expect(parsed.models?.image?.score).toBe(0.12);
  });

  it('validates real backend /api/v1/jobs/:id payload against DetectionJobSchema', () => {
    // Response emitted by reddit_extension/backend/moody_lens_ext/media.py GET /api/v1/jobs/{job_id}
    const realBackendJobPayload = {
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
      mock: false,
      error: null,
      created_at: '2026-11-03T01:22:17.697287+00:00',
      updated_at: '2026-11-03T01:22:17.946827+00:00',
    };

    const parsed = DetectionJobSchema.parse(realBackendJobPayload);
    expect(parsed.job_id).toBe('job-5d4d8c18424c4187bec45f3f65958f50');
    expect(parsed.status).toBe('completed');
    expect(parsed.mock).toBe(false);
    expect(parsed.overall_score).toBe(0.9);
  });

  it('validates Pydantic DetectionJob JSON Schema keys match Zod schema shape', () => {
    // Required and optional property keys defined in Pydantic DetectionJob model
    const pydanticExpectedProperties = [
      'job_id',
      'status',
      'overall_score',
      'label',
      'models',
      'model_versions',
      'mock',
      'error',
      'created_at',
      'updated_at',
    ];

    const zodShapeKeys = Object.keys(DetectionJobSchema.shape);
    for (const prop of pydanticExpectedProperties) {
      expect(zodShapeKeys).toContain(prop);
    }
  });
});
