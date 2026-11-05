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

// ── Video timeline, signals, batch items ────────────────────────────────────

export const TimelineEntrySchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  score: z.number().min(0).max(1),
});

export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

export const SignalSeverityEnum = z.enum(['info', 'low', 'medium', 'high']);

export const SignalEntrySchema = z.object({
  kind: z.string(),
  text: z.string(),
  severity: SignalSeverityEnum,
});

export type SignalEntry = z.infer<typeof SignalEntrySchema>;

const VerdictLabelEnum = z.enum(['likely_real', 'likely_fake', 'inconclusive']);

const JobModelsSchema = z.object({
  image: ModelResultSchema.nullable().optional(),
  face: ModelResultSchema.nullable().optional(),
  audio: ModelResultSchema.nullable().optional(),
});

export const BatchItemSchema = z.object({
  index: z.number().int().min(0),
  status: z.enum(['completed', 'failed']),
  cache_key: z.string().nullable().optional(),
  overall_score: z.number().min(0).max(1).nullable().optional(),
  label: VerdictLabelEnum.nullable().optional(),
  models: JobModelsSchema.nullable().optional(),
  model_versions: z.record(z.string(), z.string()).nullable().optional(),
  mock: z.boolean().nullable().optional(),
  timeline: z.array(TimelineEntrySchema).nullable().optional(),
  signals: z.array(SignalEntrySchema).nullable().optional(),
  error: z.string().nullable().optional(),
});

export type BatchItem = z.infer<typeof BatchItemSchema>;

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
  label: VerdictLabelEnum.nullable().optional(),
  models: JobModelsSchema.nullable().optional(),
  model_versions: z.record(z.string(), z.string()).nullable().optional(),
  mock: z.boolean().nullable().optional(),
  /** Video only; the UI draws a timeline only when this is present and non-empty. */
  timeline: z.array(TimelineEntrySchema).nullable().optional(),
  /** "Why this score" notes from the detector. */
  signals: z.array(SignalEntrySchema).nullable().optional(),
  /** sha256 of the scanned media; echoed back with feedback. */
  cache_key: z.string().nullable().optional(),
  /** Batch jobs: one entry per image; top-level fields describe the most suspicious one. */
  items: z.array(BatchItemSchema).nullable().optional(),
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

// ── Brain status (GET /api/v1/brain/status) ─────────────────────────────────

export const BrainCapabilitiesSchema = z.object({
  image: z.boolean(),
  face: z.boolean(),
  audio: z.boolean(),
  video: z.boolean(),
  explain: z.boolean(),
});

export const BrainStatusSchema = z.object({
  name: z.string(),
  version: z.string(),
  capabilities: BrainCapabilitiesSchema,
  /** True for demo detectors; the UI must show a MOCK badge. */
  is_mock: z.boolean(),
  healthy: z.boolean(),
});

export type BrainStatus = z.infer<typeof BrainStatusSchema>;

// ── Feedback (POST /api/v1/feedback) ────────────────────────────────────────

export const FeedbackLabelEnum = z.enum(['looks_right', 'looks_wrong']);
export type FeedbackLabel = z.infer<typeof FeedbackLabelEnum>;

// ── Error response ──────────────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  error: z.string(),
  detail: z.string().nullable().optional(),
  code: z.string().nullable().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
