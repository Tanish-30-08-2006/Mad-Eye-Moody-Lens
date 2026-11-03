/**
 * tests/unit/media-fetcher.test.ts – Unit tests for media-fetcher allowlist and size capping.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchMediaBlob,
  isAllowedMediaUrl,
  MediaFetchError,
  ALLOWED_HOSTS,
} from '../../src/background/media-fetcher';

describe('Media Fetcher', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('isAllowedMediaUrl', () => {
    it('accepts all allowed Reddit CDN domains over https', () => {
      for (const host of ALLOWED_HOSTS) {
        expect(isAllowedMediaUrl(`https://${host}/test_media.jpg`)).toBe(true);
      }
    });

    it('accepts subdomains of allowed hosts', () => {
      expect(isAllowedMediaUrl('https://sub.preview.redd.it/image.png')).toBe(true);
    });

    it('rejects unapproved external domains', () => {
      expect(isAllowedMediaUrl('https://malicious-site.com/image.png')).toBe(false);
      expect(isAllowedMediaUrl('https://imgur.com/image.png')).toBe(false);
      expect(isAllowedMediaUrl('https://reddit.com/post/123')).toBe(false); // main reddit html, not CDN
    });

    it('rejects plain HTTP protocol even for allowed hosts', () => {
      expect(isAllowedMediaUrl('http://i.redd.it/photo.jpg')).toBe(false);
    });

    it('rejects invalid or malformed URL strings', () => {
      expect(isAllowedMediaUrl('not-a-url')).toBe(false);
      expect(isAllowedMediaUrl('')).toBe(false);
    });
  });

  describe('fetchMediaBlob', () => {
    it('throws DISALLOWED_HOST for non-allowlisted target', async () => {
      await expect(fetchMediaBlob('https://evil.com/fake.png')).rejects.toThrow(MediaFetchError);
      await expect(fetchMediaBlob('https://evil.com/fake.png')).rejects.toMatchObject({
        code: 'DISALLOWED_HOST',
      });
    });

    it('throws DISALLOWED_PROTOCOL for http URLs', async () => {
      await expect(fetchMediaBlob('http://i.redd.it/test.png')).rejects.toMatchObject({
        code: 'DISALLOWED_PROTOCOL',
      });
    });

    it('throws SIZE_EXCEEDED when Content-Length header exceeds limit', async () => {
      const mockResponse = new Response(new Blob(['mock data']), {
        status: 200,
        headers: {
          'Content-Length': (100 * 1024 * 1024).toString(), // 100MB
          'Content-Type': 'image/jpeg',
        },
      });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      await expect(
        fetchMediaBlob('https://i.redd.it/huge.jpg', { maxBytes: 50 * 1024 * 1024 }),
      ).rejects.toMatchObject({
        code: 'SIZE_EXCEEDED',
      });
    });

    it('throws SIZE_EXCEEDED when blob body exceeds limit', async () => {
      const oversizedBlob = new Blob([new Uint8Array(60 * 1024 * 1024)]);
      const mockResponse = new Response(oversizedBlob, {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      await expect(
        fetchMediaBlob('https://i.redd.it/oversized.jpg', { maxBytes: 50 * 1024 * 1024 }),
      ).rejects.toMatchObject({
        code: 'SIZE_EXCEEDED',
      });
    });

    it('fetches valid allowlisted media successfully', async () => {
      const validBlob = new Blob(['sample-image-bytes'], { type: 'image/png' });
      const mockResponse = new Response(validBlob, {
        status: 200,
        headers: {
          'Content-Length': '18',
          'Content-Type': 'image/png',
        },
      });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await fetchMediaBlob('https://i.redd.it/photo.png');
      expect(result.contentType).toBe('image/png');
      expect(result.sizeBytes).toBe(18);
      expect(result.blob).toBeDefined();
    });

    it('throws NETWORK_ERROR on HTTP 404 or 500 responses', async () => {
      const mockResponse = new Response(null, { status: 404, statusText: 'Not Found' });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      await expect(fetchMediaBlob('https://i.redd.it/missing.jpg')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        status: 404,
      });
    });
  });
});
