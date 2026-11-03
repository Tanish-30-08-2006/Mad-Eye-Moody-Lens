/**
 * core/messaging.ts – Typed, runtime-validated message passing for Moody Lens.
 *
 * All messages between content scripts, popups, and the service worker flow
 * through this module. Content scripts NEVER make network requests directly (MV3);
 * requests are validated with Zod and routed through the service worker.
 */

import { z } from 'zod';
import type { DetectionJob, JobStatus } from './schema';

// ── Zod Schemas for Message Payloads ─────────────────────────────────────────

export const PingRequestSchema = z.object({
  type: z.literal('PING'),
});

export const ScanMediaPayloadSchema = z.object({
  mediaUrls: z.array(z.string().url()).min(1),
  audioUrl: z.string().url().optional(),
  postId: z.string().min(1),
  permalink: z.string(),
  mediaType: z.enum(['image', 'video', 'audio']),
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

export const ExtensionMessageSchema = z.discriminatedUnion('type', [
  PingRequestSchema,
  ScanMediaRequestSchema,
  GetJobStatusRequestSchema,
  CancelJobRequestSchema,
  GetSettingsRequestSchema,
]);

export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;
export type PingRequest = z.infer<typeof PingRequestSchema>;
export type ScanMediaRequest = z.infer<typeof ScanMediaRequestSchema>;
export type GetJobStatusRequest = z.infer<typeof GetJobStatusRequestSchema>;
export type CancelJobRequest = z.infer<typeof CancelJobRequestSchema>;
export type GetSettingsRequest = z.infer<typeof GetSettingsRequestSchema>;

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
  settings: {
    apiUrl: string;
    enableAutoScan: boolean;
    enableUrlDetect: boolean;
    logLevel: string;
  };
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
    error: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
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
