/**
 * core/messaging.ts – Typed message passing between content script and service worker.
 *
 * All messages between contexts flow through this module.
 * Content scripts must never make network calls directly (MV3 constraint);
 * they send typed messages here and the service worker handles them.
 */

// ── Message type discriminants ──────────────────────────────────────────────

export type MessageType =
  | 'PING'
  | 'SCAN_MEDIA'
  | 'GET_JOB_STATUS'
  | 'CANCEL_JOB'
  | 'GET_SETTINGS';

// ── Request payloads ────────────────────────────────────────────────────────

export interface PingRequest {
  type: 'PING';
}

export interface ScanMediaRequest {
  type: 'SCAN_MEDIA';
  payload: {
    /** TODO: Accept MediaRef from adapters/types.ts in Phase 3 */
    mediaUrls: string[];
    audioUrl?: string;
    postId: string;
    permalink: string;
    mediaType: 'image' | 'video' | 'audio';
  };
}

export interface GetJobStatusRequest {
  type: 'GET_JOB_STATUS';
  payload: {
    jobId: string;
  };
}

export interface CancelJobRequest {
  type: 'CANCEL_JOB';
  payload: {
    jobId: string;
  };
}

export interface GetSettingsRequest {
  type: 'GET_SETTINGS';
}

export type ExtensionMessage =
  | PingRequest
  | ScanMediaRequest
  | GetJobStatusRequest
  | CancelJobRequest
  | GetSettingsRequest;

// ── Response payloads ───────────────────────────────────────────────────────

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
  /** TODO: Use DetectionJob from schema.ts in Phase 3 */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: unknown;
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
  | ErrorResponse;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Send a typed message from content script to service worker.
 * TODO: Implement in Phase 3 with proper error handling and timeouts.
 */
export async function sendMessage(
  message: ExtensionMessage,
): Promise<ExtensionResponse> {
  return chrome.runtime.sendMessage(message);
}

/**
 * Type guard for checking message types in the service worker handler.
 */
export function isExtensionMessage(msg: unknown): msg is ExtensionMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    typeof (msg as ExtensionMessage).type === 'string'
  );
}
