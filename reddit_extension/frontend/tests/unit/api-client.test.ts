/**
 * tests/unit/api-client.test.ts – Unit tests for backend API client and error mapping.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  submitDetection,
  getJobStatus,
  checkHealth,
} from '../../src/core/api-client';

describe('API Client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('submitDetection', () => {
    it('submits media and returns parsed job ID', async () => {
      const mockResponse = new Response(JSON.stringify({ job_id: 'job-12345' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const blob = new Blob(['image data'], { type: 'image/png' });
      const result = await submitDetection(blob, undefined, {
        postId: 't3_abc',
        permalink: 'https://reddit.com/r/test/comments/123',
        mediaType: 'image',
      });

      expect(result.job_id).toBe('job-12345');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/detect',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('maps network connection failures to NETWORK_ERROR', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const blob = new Blob(['image data']);
      await expect(submitDetection(blob)).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
    });

    it('maps HTTP 413 response to HTTP_ERROR', async () => {
      const mockResponse = new Response(
        JSON.stringify({ error: 'File too large', code: 'FILE_TOO_LARGE' }),
        { status: 413, headers: { 'Content-Type': 'application/json' } },
      );
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const blob = new Blob(['huge data']);
      await expect(submitDetection(blob)).rejects.toMatchObject({
        code: 'HTTP_ERROR',
        status: 413,
      });
    });

    it('maps schema mismatch to SCHEMA_ERROR', async () => {
      // Missing job_id field
      const mockResponse = new Response(JSON.stringify({ wrong_key: 'test' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const blob = new Blob(['image data']);
      await expect(submitDetection(blob)).rejects.toMatchObject({
        code: 'SCHEMA_ERROR',
      });
    });
  });

  describe('getJobStatus', () => {
    it('retrieves and validates completed DetectionJob payload', async () => {
      const completedJob = {
        job_id: 'job-999',
        status: 'completed',
        overall_score: 0.88,
        label: 'likely_fake',
        models: {
          image: { score: 0.9, label: 'fake', confidence: 0.8 },
        },
        model_versions: { image: '1.0.0' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockResponse = new Response(JSON.stringify(completedJob), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await getJobStatus('job-999');
      expect(result.job_id).toBe('job-999');
      expect(result.status).toBe('completed');
      expect(result.label).toBe('likely_fake');
      expect(result.overall_score).toBe(0.88);
    });

    it('maps 404 response to NOT_FOUND', async () => {
      const mockResponse = new Response(
        JSON.stringify({ error: 'Job not found', code: 'JOB_NOT_FOUND' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      await expect(getJobStatus('missing-job')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        status: 404,
      });
    });
  });

  describe('checkHealth', () => {
    it('retrieves and validates backend health check', async () => {
      const healthPayload = {
        status: 'ok',
        version: '1.0.0',
        models_available: ['image', 'face', 'audio'],
      };
      const mockResponse = new Response(JSON.stringify(healthPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await checkHealth();
      expect(result.status).toBe('ok');
      expect(result.models_available).toContain('image');
    });
  });
});
