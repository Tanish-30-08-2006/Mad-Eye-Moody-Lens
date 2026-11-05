/**
 * tests/unit/messaging.test.ts – Unit tests for messaging type guards, schemas, and sender validation.
 */

import { describe, it, expect } from 'vitest';
import {
  isExtensionMessage,
  validateMessage,
  isAuthorizedSender,
} from '../../src/core/messaging';

describe('Messaging Protocol and Runtime Validation', () => {
  it('validates a valid PING message', () => {
    const msg = { type: 'PING' };
    expect(isExtensionMessage(msg)).toBe(true);
    const validated = validateMessage(msg);
    expect(validated.success).toBe(true);
  });

  it('validates a valid SCAN_MEDIA message with full payload', () => {
    const msg = {
      type: 'SCAN_MEDIA',
      payload: {
        mediaUrls: ['https://i.redd.it/example.jpg'],
        audioUrl: 'https://v.redd.it/audio.mp4',
        postId: 't3_12345',
        permalink: 'https://reddit.com/r/test/comments/12345/test_post/',
        mediaType: 'image' as const,
      },
    };
    expect(isExtensionMessage(msg)).toBe(true);
    const validated = validateMessage(msg);
    expect(validated.success).toBe(true);
  });

  it('rejects SCAN_MEDIA with invalid URLs or empty arrays', () => {
    const invalidMsg = {
      type: 'SCAN_MEDIA',
      payload: {
        mediaUrls: ['not-a-valid-url'],
        postId: 't3_12345',
        permalink: 'invalid',
        mediaType: 'image' as const,
      },
    };
    expect(isExtensionMessage(invalidMsg)).toBe(false);
    const validated = validateMessage(invalidMsg);
    expect(validated.success).toBe(false);
  });

  it('validates GET_JOB_STATUS and CANCEL_JOB messages', () => {
    const statusMsg = {
      type: 'GET_JOB_STATUS',
      payload: { jobId: 'job-123' },
    };
    expect(isExtensionMessage(statusMsg)).toBe(true);

    const cancelMsg = {
      type: 'CANCEL_JOB',
      payload: { jobId: 'job-123' },
    };
    expect(isExtensionMessage(cancelMsg)).toBe(true);
  });

  it('rejects null, non-object, and unhandled message types', () => {
    expect(isExtensionMessage(null)).toBe(false);
    expect(isExtensionMessage(undefined)).toBe(false);
    expect(isExtensionMessage('PING')).toBe(false);
    expect(isExtensionMessage({ type: 'UNKNOWN_TYPE' })).toBe(false);
  });

  describe('isAuthorizedSender', () => {
    it('approves sender with matching extension ID', () => {
      (global as unknown as { chrome: unknown }).chrome = {
        runtime: { id: 'test-extension-id' },
      };
      expect(isAuthorizedSender({ id: 'test-extension-id' } as chrome.runtime.MessageSender)).toBe(true);
    });

    it('rejects sender with mismatched extension ID', () => {
      (global as unknown as { chrome: unknown }).chrome = {
        runtime: { id: 'test-extension-id' },
      };
      expect(isAuthorizedSender({ id: 'malicious-extension-id' } as chrome.runtime.MessageSender)).toBe(false);
    });
  });
});
