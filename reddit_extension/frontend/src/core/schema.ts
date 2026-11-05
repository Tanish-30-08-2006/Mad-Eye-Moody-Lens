/**
 * core/schema.ts – Zod schemas for the job/verdict API contract.
 *
 * Mirrors the backend's Pydantic models. Keeps the extension and backend
 * type contracts in lockstep. Used to validate API responses at runtime.
 *
 * Contract: see reddit_extension/frontend/docs/API-CONTRACT.md
 */

import { z } from 'zod';

// ── Model result (per-detector output) ──────────────────────────────────────

export const ModelResultSchema = z.object({
  score: z.number().min(0).max(1),
  label: z.string(),
  confidence: z.number().min(0).max(1),
});

export type ModelResult = z.infer<typeof ModelResultSchema>;

// ── Detection job status ────────────────────────────────────────────────────

export const JobStatusEnum = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'queued',
  'running',
  'done',
]);

export type JobStatus = z.infer<typeof JobStatusEnum>;

// ── Detection job response (GET /api/v1/jobs/{id}) ──────────────────────────

export const DetectionJobSchema = z.object({
  job_id: z.string(),
  status: JobStatusEnum,
  overall_score: z.number().min(0).max(1).nullable().optional(),
  label: z
    .enum(['likely_real', 'likely_fake', 'inconclusive'])
    .nullable()
    .optional(),
  models: z
    .object({
      image: ModelResultSchema.nullable().optional(),
      face: ModelResultSchema.nullable().optional(),
      audio: ModelResultSchema.nullable().optional(),
    })
    .nullable()
    .optional(),
  model_versions: z.record(z.string(), z.string()).nullable().optional(),
  mock: z.boolean().optional(),
  error: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type DetectionJob = z.infer<typeof DetectionJobSchema>;

// ── Submit detection response (POST /api/v1/detect) ─────────────────────────

export const DetectResponseSchema = z.object({
  job_id: z.string(),
});

export type DetectResponse = z.infer<typeof DetectResponseSchema>;

// ── Health check (GET /api/v1/health) ───────────────────────────────────────

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  version: z.string().optional().default('1.0.0'),
  models_available: z.array(z.string()).optional().default([]),
  /** True when the backend would answer with demo/mock verdicts. */
  mock: z.boolean().optional(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ── Error response ──────────────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  error: z.string(),
  detail: z.string().nullable().optional(),
  code: z.string().nullable().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
