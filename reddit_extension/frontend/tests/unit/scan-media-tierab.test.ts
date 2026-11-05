/**
 * tests/unit/scan-media-tierab.test.ts – Gallery batch, hash-cache hit, local-only gate, history record, feedback and new message validation.
 * Label: RUNTIME (mocked modules, not real network/Chrome).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const m = vi.hoisted(() => ({
  fetchMediaBlob: vi.fn(),
  submitDetection: vi.fn(),
  submitBatch: vi.fn(),
  lookupVerdict: vi.fn(),
  sendFeedback: vi.fn(),
  pollJobUntilComplete: vi.fn(),
  getCachedResult: vi.fn(),
  setCachedResult: vi.fn(),
  getConsent: vi.fn(),
  loadSettings: vi.fn(),
  addHistory: vi.fn(),
}));

vi.mock('../../src/background/media-fetcher', async (orig) => ({ ...(await orig<typeof import('../../src/background/media-fetcher')>()), fetchMediaBlob: m.fetchMediaBlob }));
vi.mock('../../src/core/api-client', async (orig) => ({
  ...(await orig<typeof import('../../src/core/api-client')>()),
  submitDetection: m.submitDetection,
  submitBatch: m.submitBatch,
  lookupVerdict: m.lookupVerdict,
  sendFeedback: m.sendFeedback,
}));
vi.mock('../../src/background/job-poller', async (orig) => ({ ...(await orig<typeof import('../../src/background/job-poller')>()), pollJobUntilComplete: m.pollJobUntilComplete }));
vi.mock('../../src/core/cache', async (orig) => ({ ...(await orig<typeof import('../../src/core/cache')>()), getCachedResult: m.getCachedResult, setCachedResult: m.setCachedResult }));
vi.mock('../../src/core/consent', () => ({ getConsent: m.getConsent, setConsent: vi.fn() }));
vi.mock('../../src/core/history', async (orig) => ({ ...(await orig<typeof import('../../src/core/history')>()), addHistory: m.addHistory }));
vi.mock('../../src/core/settings', async (orig) => ({ ...(await orig<typeof import('../../src/core/settings')>()), loadSettings: m.loadSettings }));
vi.mock('../../src/background/keepalive', () => ({ startKeepalive: vi.fn(), stopKeepalive: vi.fn() }));

import { handleScanMedia } from '../../src/background/handlers/scan-media';
import { handleFeedback } from '../../src/background/handlers/feedback';
import { DEFAULT_SETTINGS } from '../../src/core/settings';
import { ExtensionMessageSchema, ScanMediaPayloadSchema, TabMessageSchema } from '../../src/core/messaging';
import type { ScanMediaRequest } from '../../src/core/messaging';
import type { DetectionJob } from '../../src/core/schema';

const job: DetectionJob = { job_id: 'j1', status: 'completed', overall_score: 0.8, label: 'likely_fake', created_at: 'now', updated_at: 'now' };
const urls = ['https://i.redd.it/1.jpg', 'https://i.redd.it/2.jpg', 'https://i.redd.it/3.jpg'];
const req = (over: Partial<ScanMediaRequest['payload']> = {}): ScanMediaRequest => ({
  type: 'SCAN_MEDIA',
  payload: { mediaUrls: [urls[0]!], postId: 't3_a', permalink: 'https://www.reddit.com/r/t/comments/a/x/', mediaType: 'image', origin: 'manual', ...over },
});

beforeEach(() => {
  vi.resetAllMocks();
  m.getConsent.mockResolvedValue(true);
  m.getCachedResult.mockResolvedValue(null);
  m.loadSettings.mockResolvedValue({ ...DEFAULT_SETTINGS });
  m.fetchMediaBlob.mockImplementation(async (url: string) => ({ blob: new Blob([url]), contentType: 'image/jpeg', sizeBytes: 1 }));
  m.submitDetection.mockResolvedValue({ job_id: 'j1' });
  m.submitBatch.mockResolvedValue({ job_id: 'jb' });
  m.lookupVerdict.mockResolvedValue(null);
  m.pollJobUntilComplete.mockResolvedValue(job);
});

describe('gallery batch', () => {
  it('sends every image in ONE batch request and records history without titles or URLs', async () => {
    const res = await handleScanMedia(req({ mediaUrls: urls, gallery: true, kind: 'gallery' }));
    expect(res).toMatchObject({ type: 'JOB_STATUS', status: 'completed' });
    expect(m.submitBatch).toHaveBeenCalledTimes(1);
    expect(m.submitBatch.mock.calls[0]![0]).toHaveLength(3);
    expect(m.submitDetection).not.toHaveBeenCalled();
    const saved = m.addHistory.mock.calls[0]![0];
    expect(saved).toMatchObject({ postId: 't3_a', kind: 'gallery', label: 'likely_fake' });
    expect(JSON.stringify(saved)).not.toContain('i.redd.it');
  });

  it('does not record history when the setting is off', async () => {
    m.loadSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, saveHistory: false });
    await handleScanMedia(req());
    expect(m.addHistory).not.toHaveBeenCalled();
  });
});

describe('hash cache', () => {
  it('answers a known repost from the backend cache without uploading', async () => {
    m.lookupVerdict.mockResolvedValue(job);
    const res = await handleScanMedia(req());
    expect(res).toMatchObject({ type: 'JOB_STATUS', result: job });
    expect(m.submitDetection).not.toHaveBeenCalled();
    expect(m.pollJobUntilComplete).not.toHaveBeenCalled();
  });
});

describe('local-only mode', () => {
  beforeEach(() => m.loadSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, localOnly: true }));

  it('needs no consent and uploads nothing', async () => {
    m.getConsent.mockResolvedValue(false);
    const res = await handleScanMedia(req());
    expect(res.type).toBe('LOCAL_HINTS');
    expect(m.submitDetection).not.toHaveBeenCalled();
    expect(m.submitBatch).not.toHaveBeenCalled();
    expect(m.lookupVerdict).not.toHaveBeenCalled();
  });
});

describe('feedback', () => {
  const fb = { type: 'SEND_FEEDBACK' as const, payload: { cacheKey: 'a'.repeat(64), verdictLabel: 'likely_fake' as const, userLabel: 'agree' as const } };

  it('sends labels and the cache key only, after consent', async () => {
    expect(await handleFeedback(fb)).toEqual({ type: 'OK' });
    expect(m.sendFeedback).toHaveBeenCalledWith(fb.payload);
  });

  it('is blocked without consent', async () => {
    m.getConsent.mockResolvedValue(false);
    expect(await handleFeedback(fb)).toMatchObject({ type: 'ERROR', code: 'CONSENT_REQUIRED' });
    expect(m.sendFeedback).not.toHaveBeenCalled();
  });
});

describe('new message validation', () => {
  it('accepts resolve-only scans and rejects empty ones', () => {
    const base = { postId: 'p', permalink: '/x', mediaType: 'image' };
    expect(ScanMediaPayloadSchema.safeParse({ ...base, mediaUrls: [], resolve: true }).success).toBe(true);
    expect(ScanMediaPayloadSchema.safeParse({ ...base, mediaUrls: [] }).success).toBe(false);
    expect(ScanMediaPayloadSchema.safeParse({ ...base, mediaUrls: ['https://evil.example/a.jpg'] }).success).toBe(false);
  });

  it('validates feedback, brain status and tab messages', () => {
    expect(ExtensionMessageSchema.safeParse({ type: 'GET_BRAIN_STATUS' }).success).toBe(true);
    expect(ExtensionMessageSchema.safeParse({ ...({ type: 'SEND_FEEDBACK' }), payload: { cacheKey: 'zz', verdictLabel: 'likely_fake', userLabel: 'agree' } }).success).toBe(false);
    expect(TabMessageSchema.safeParse({ type: 'SCAN_VISIBLE' }).success).toBe(true);
    expect(TabMessageSchema.safeParse({ type: 'SCAN_NEAREST' }).success).toBe(true);
  });
});
