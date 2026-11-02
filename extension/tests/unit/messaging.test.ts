/**
 * tests/unit/messaging.test.ts – Unit tests for messaging type guards and definitions.
 *
 * Ensures runtime validation of message envelopes passing between content scripts and service worker.
 */

import { describe, it, expect } from 'vitest';
import { isExtensionMessage } from '../../src/core/messaging';

describe('Messaging Protocol Type Guards', () => {
  it('identifies valid PING message', () => {
    const msg = { type: 'PING' };
    expect(isExtensionMessage(msg)).toBe(true);
  });

  it('identifies valid SCAN_MEDIA message', () => {
    const msg = {
      type: 'SCAN_MEDIA',
      payload: {
        mediaUrls: ['https://i.redd.it/example.jpg'],
        postId: 't3_12345',
        permalink: '/r/test/comments/12345/test_post/',
        mediaType: 'image' as const,
      },
    };
    expect(isExtensionMessage(msg)).toBe(true);
  });

  it('rejects null or non-object payloads', () => {
    expect(isExtensionMessage(null)).toBe(false);
    expect(isExtensionMessage(undefined)).toBe(false);
    expect(isExtensionMessage('PING')).toBe(false);
    expect(isExtensionMessage(123)).toBe(false);
  });

  it('rejects objects missing type property', () => {
    expect(isExtensionMessage({ payload: {} })).toBe(false);
  });
});
