/**
 * core/messaging.ts – Typed, runtime-validated message passing for Moody Lens.
 *
 * All messages between content scripts, popups, and the service worker flow
 * through this module. Content scripts NEVER make network requests directly (MV3);
 * requests are validated with Zod and routed through the service worker.
 */

import { z } from 'zod';
import type { DetectionJob, HealthResponse, JobStatus } from './schema';
import type { ExtensionSettings } from './settings';
import { isAllowedMediaUrl } from './media-url';

// ── Zod Schemas for Message Payloads ─────────────────────────────────────────

export const PingRequestSchema = z.object({
  type: z.literal('PING'),
});

/** https + allowlisted CDN host only; anything else is rejected at the message boundary. */
const MediaUrlSchema = z.string().url().refine(isAllowedMediaUrl, 'Media URL must be https on an allowed Reddit CDN host');

export const ScanOriginSchema = z.enum(['manual', 'auto', 'context-menu']);
export type ScanOrigin = z.infer<typeof ScanOriginSchema>;

export const ScanMediaPayloadSchema = z.object({
  mediaUrls: z.array(MediaUrlSchema).min(1).max(100),
  audioUrl: MediaUrlSchema.optional(),
  postId: z.string().min(1),
  permalink: z.string(),
  mediaType: z.enum(['image', 'video', 'audio']),
  /** Who asked: a lens click, the auto-scan feature or the context menu. */
  origin: ScanOriginSchema.optional(),
});

export const ScanMediaRequestSchema = z.object({
  type: z.literal('SCAN_MEDIA'),
  payload: ScanMediaPayloadSchema,
});

export const GetJobStatusRequestSchema = z.object({
  type: z.literal('GET_JOB_STATUS'),
  payload: z.object({
    jobId: z.string().min(1),
  }),
});

export const CancelJobRequestSchema = z.object({
  type: z.literal('CANCEL_JOB'),
  payload: z.object({
    jobId: z.string().min(1),
  }),
});

export const GetSettingsRequestSchema = z.object({
  type: z.literal('GET_SETTINGS'),
});

export const GetConsentRequestSchema = z.object({ type: z.literal('GET_CONSENT') });

export const SetConsentRequestSchema = z.object({
  type: z.literal('SET_CONSENT'),
  payload: z.object({ accepted: z.boolean() }),
});

export const CheckHealthRequestSchema = z.object({ type: z.literal('CHECK_HEALTH') });

export const ClearCacheRequestSchema = z.object({ type: z.literal('CLEAR_CACHE') });

export const ExtensionMessageSchema = z.discriminatedUnion('type', [
  PingRequestSchema,
  ScanMediaRequestSchema,
  GetJobStatusRequestSchema,
  CancelJobRequestSchema,
  GetSettingsRequestSchema,
  GetConsentRequestSchema,
  SetConsentRequestSchema,
  CheckHealthRequestSchema,
  ClearCacheRequestSchema,
]);

export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;
export type PingRequest = z.infer<typeof PingRequestSchema>;
export type ScanMediaRequest = z.infer<typeof ScanMediaRequestSchema>;
export type GetJobStatusRequest = z.infer<typeof GetJobStatusRequestSchema>;
export type CancelJobRequest = z.infer<typeof CancelJobRequestSchema>;
export type GetSettingsRequest = z.infer<typeof GetSettingsRequestSchema>;
export type SetConsentRequest = z.infer<typeof SetConsentRequestSchema>;

// ── Response Schemas and Types ──────────────────────────────────────────────

export interface PingResponse {
  type: 'PONG';
  timestamp: number;
}

export interface ScanMediaResponse {
  type: 'SCAN_RESULT';
  jobId: string;
}

export interface JobStatusResponse {
  type: 'JOB_STATUS';
  status: JobStatus;
  result?: DetectionJob;
}

export interface SettingsResponse {
  type: 'SETTINGS';
  settings: ExtensionSettings;
}

export interface ConsentResponse {
  type: 'CONSENT';
  accepted: boolean;
}

export interface HealthResultResponse {
  type: 'HEALTH';
  health: HealthResponse;
}

export interface OkResponse {
  type: 'OK';
}

export interface ErrorResponse {
  type: 'ERROR';
  error: string;
  code?: string;
}

export type ExtensionResponse =
  | PingResponse
  | ScanMediaResponse
  | JobStatusResponse
  | SettingsResponse
  | ConsentResponse
  | HealthResultResponse
  | OkResponse
  | ErrorResponse;

// ── Validation Helpers ───────────────────────────────────────────────────────

/**
 * Validate that an unknown object matches an ExtensionMessage schema.
 */
export function validateMessage(msg: unknown): {
  success: boolean;
  data?: ExtensionMessage;
  error?: string;
} {
  const result = ExtensionMessageSchema.safeParse(msg);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
  };
}

/**
 * Type guard for ExtensionMessage with runtime validation.
 */
export function isExtensionMessage(msg: unknown): msg is ExtensionMessage {
  return ExtensionMessageSchema.safeParse(msg).success;
}

/**
 * Validates that a message sender originates from this extension.
 * Rejects external web pages or unauthorized extension callers.
 */
export function isAuthorizedSender(sender: chrome.runtime.MessageSender): boolean {
  // If chrome.runtime.id is available, ensure sender.id matches
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    if (sender.id && sender.id !== chrome.runtime.id) {
      return false;
    }
  }
  return true;
}

// ── Messages sent TO content scripts (service worker / popup → page) ────────

export const ShowResultMessageSchema = z.object({
  type: z.literal('SHOW_RESULT'),
  payload: z.discriminatedUnion('state', [
    z.object({ state: z.literal('loading') }),
    z.object({ state: z.literal('result'), job: z.custom<DetectionJob>((v) => !!v && typeof v === 'object') }),
    z.object({ state: z.literal('error'), message: z.string(), code: z.string().optional() }),
  ]),
});

export const GetPageStatusMessageSchema = z.object({ type: z.literal('GET_PAGE_STATUS') });

export const TabMessageSchema = z.discriminatedUnion('type', [
  ShowResultMessageSchema,
  GetPageStatusMessageSchema,
]);

export type TabMessage = z.infer<typeof TabMessageSchema>;
export type ShowResultMessage = z.infer<typeof ShowResultMessageSchema>;

export interface PageStatusResponse {
  type: 'PAGE_STATUS';
  /** Posts handed to the adapter (visible, any type). */
  postsSeen: number;
  /** Lens buttons currently mounted. */
  lensButtons: number;
}

export function isTabMessage(msg: unknown): msg is TabMessage {
  return TabMessageSchema.safeParse(msg).success;
}

// ── Dispatch Helper ─────────────────────────────────────────────────────────

/**
 * Send a typed message with a timeout safeguard.
 */
export async function sendMessage(
  message: ExtensionMessage,
  timeoutMs: number = 30000,
): Promise<ExtensionResponse> {
  const validation = validateMessage(message);
  if (!validation.success) {
    throw new Error(`Invalid extension message: ${validation.error}`);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Message timed out after ${timeoutMs}ms for type: ${message.type}`));
    }, timeoutMs);

    try {
      chrome.runtime.sendMessage(message, (response: ExtensionResponse) => {
        clearTimeout(timer);
        const lastErr = chrome.runtime.lastError;
        if (lastErr) {
          reject(new Error(lastErr.message || 'Error communicating with background worker'));
          return;
        }
        resolve(response);
      });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}
