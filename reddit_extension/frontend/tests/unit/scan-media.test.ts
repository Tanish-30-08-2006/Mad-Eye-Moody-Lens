/**
 * tests/unit/scan-media.test.ts – Service-worker scan handler with all I/O mocked.
 * Covers: consent gate, cache, auto-scan rules, image/video/audio paths, rendition fallback,
 * server fallback, HLS-only, friendly errors, in-flight dedupe, queue concurrency.
 * Label: RUNTIME (mocked modules, not real network/Chrome).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const m = vi.hoisted(() => ({
  fetchMediaBlob: vi.fn(),
  submitDetection: vi.fn(),
  submitDetectUrl: vi.fn(),
  pollJobUntilComplete: vi.fn(),
  getCachedResult: vi.fn(),
  setCachedResult: vi.fn(),
  getConsent: vi.fn(),
  loadSettings: vi.fn(),
}));

vi.mock('../../src/background/media-fetcher', async (orig) => ({
  ...(await orig<typeof import('../../src/background/media-fetcher')>()),
  fetchMediaBlob: m.fetchMediaBlob,
}));
vi.mock('../../src/core/api-client', async (orig) => ({
  ...(await orig<typeof import('../../src/core/api-client')>()),
  submitDetection: m.submitDetection,
  submitDetectUrl: m.submitDetectUrl,
}));
vi.mock('../../src/background/job-poller', async (orig) => ({
  ...(await orig<typeof import('../../src/background/job-poller')>()),
  pollJobUntilComplete: m.pollJobUntilComplete,
}));
vi.mock('../../src/core/cache', async (orig) => ({
  ...(await orig<typeof import('../../src/core/cache')>()),
  getCachedResult: m.getCachedResult,
  setCachedResult: m.setCachedResult,
}));
vi.mock('../../src/core/consent', () => ({ getConsent: m.getConsent, setConsent: vi.fn() }));
vi.mock('../../src/core/settings', async (orig) => ({
  ...(await orig<typeof import('../../src/core/settings')>()),
  loadSettings: m.loadSettings,
}));
vi.mock('../../src/background/keepalive', () => ({ startKeepalive: vi.fn(), stopKeepalive: vi.fn() }));

import { handleScanMedia } from '../../src/background/handlers/scan-media';
import { ScanQueue } from '../../src/background/scan-queue';
import * as queueModule from '../../src/background/scan-queue';
import { MediaFetchError } from '../../src/background/media-fetcher';
import { ApiClientError } from '../../src/core/api-client';
import { PollerError } from '../../src/background/job-poller';
import { DEFAULT_SETTINGS } from '../../src/core/settings';
import type { ScanMediaRequest } from '../../src/core/messaging';
import type { DetectionJob } from '../../src/core/schema';

const job: DetectionJob = {
  job_id: 'j1',
  status: 'completed',
  overall_score: 0.8,
  label: 'likely_fake',
  created_at: 'now',
  updated_at: 'now',
};

const blob = (name: string) => ({ blob: new Blob([name]), contentType: 'x', sizeBytes: 1 });
const u = (name: string) => `https://v.redd.it/vid/${name}`;

function req(over: Partial<ScanMediaRequest['payload']> = {}): ScanMediaRequest {
  return {
    type: 'SCAN_MEDIA',
    payload: {
      mediaUrls: ['https://i.redd.it/a.jpg'],
      postId: 't3_a',
      permalink: 'https://www.reddit.com/r/t/comments/a/x/',
      mediaType: 'image',
      origin: 'manual',
      ...over,
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  m.getConsent.mockResolvedValue(true);
  m.getCachedResult.mockResolvedValue(null);
  m.loadSettings.mockResolvedValue({ ...DEFAULT_SETTINGS });
  m.fetchMediaBlob.mockImplementation(async (url: string) => blob(url));
  m.submitDetection.mockResolvedValue({ job_id: 'j1' });
  m.submitDetectUrl.mockResolvedValue({ job_id: 'jurl' });
  m.pollJobUntilComplete.mockResolvedValue(job);
});

describe('consent gate', () => {
  it('refuses with CONSENT_REQUIRED before fetching or uploading anything', async () => {
    m.getConsent.mockResolvedValue(false);
    const res = await handleScanMedia(req());
    expect(res).toMatchObject({ type: 'ERROR', code: 'CONSENT_REQUIRED' });
    expect(m.fetchMediaBlob).not.toHaveBeenCalled();
    expect(m.submitDetection).not.toHaveBeenCalled();
    expect(m.getCachedResult).not.toHaveBeenCalled();
  });
});

describe('images', () => {
  it('fetches, uploads, polls and caches the verdict', async () => {
    const res = await handleScanMedia(req());
    expect(res).toMatchObject({ type: 'JOB_STATUS', status: 'completed', result: job });
    expect(m.fetchMediaBlob).toHaveBeenCalledWith('https://i.redd.it/a.jpg');
    expect(m.submitDetection).toHaveBeenCalledWith(expect.any(Blob), undefined, expect.objectContaining({ mediaType: 'image' }));
    expect(m.setCachedResult).toHaveBeenCalledWith('t3_a', 'https://i.redd.it/a.jpg', job);
  });

  it('returns a cached verdict without any network call', async () => {
    m.getCachedResult.mockResolvedValue({ result: job });
    const res = await handleScanMedia(req());
    expect(res).toMatchObject({ type: 'JOB_STATUS', result: job });
    expect(m.fetchMediaBlob).not.toHaveBeenCalled();
  });
});

describe('videos', () => {
  const video = (urls: string[], audioUrl?: string) => req({ mediaType: 'video', mediaUrls: urls, audioUrl });

  it('uploads the <=480p MP4 plus the audio track', async () => {
    await handleScanMedia(video([u('DASH_1080.mp4'), u('DASH_480.mp4'), u('DASH_360.mp4')], u('DASH_audio.mp4')));
    expect(m.fetchMediaBlob.mock.calls.map((c) => c[0])).toEqual([u('DASH_480.mp4'), u('DASH_audio.mp4')]);
    const [mediaBlob, audioBlob] = m.submitDetection.mock.calls[0]!;
    expect(mediaBlob).toBeInstanceOf(Blob);
    expect(audioBlob).toBeInstanceOf(Blob);
  });

  it('a silent video uploads video only', async () => {
    await handleScanMedia(video([u('DASH_360.mp4')]));
    expect(m.fetchMediaBlob).toHaveBeenCalledTimes(1);
    expect(m.submitDetection.mock.calls[0]![1]).toBeUndefined();
  });

  it('a failed audio fetch degrades to video-only instead of failing', async () => {
    m.fetchMediaBlob.mockImplementation(async (url: string) => {
      if (url.includes('audio')) throw new MediaFetchError('nope', 'NETWORK_ERROR', 404);
      return blob(url);
    });
    const res = await handleScanMedia(video([u('DASH_360.mp4')], u('DASH_audio.mp4')));
    expect(res.type).toBe('JOB_STATUS');
    expect(m.submitDetection.mock.calls[0]![1]).toBeUndefined();
  });

  it('tries the next rendition when one is over the size cap', async () => {
    m.fetchMediaBlob.mockImplementation(async (url: string) => {
      if (url.includes('480')) throw new MediaFetchError('big', 'SIZE_EXCEEDED');
      return blob(url);
    });
    await handleScanMedia(video([u('DASH_480.mp4'), u('DASH_360.mp4')]));
    expect(m.fetchMediaBlob.mock.calls.map((c) => c[0])).toEqual([u('DASH_480.mp4'), u('DASH_360.mp4')]);
    expect(m.submitDetection).toHaveBeenCalledTimes(1);
  });

  it('HLS/DASH-only video shows "Video format not supported yet" with the fallback off', async () => {
    const res = await handleScanMedia(video([u('HLSPlaylist.m3u8')]));
    expect(res).toMatchObject({ type: 'ERROR', code: 'UNSUPPORTED_VIDEO', error: 'Video format not supported yet.' });
    expect(m.fetchMediaBlob).not.toHaveBeenCalled();
    expect(m.submitDetectUrl).not.toHaveBeenCalled();
  });

  it('HLS-only uses the server fallback when the user enabled it', async () => {
    m.loadSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, enableUrlDetect: true });
    await handleScanMedia(video([u('HLSPlaylist.m3u8')]));
    expect(m.submitDetectUrl).toHaveBeenCalledWith('https://www.reddit.com/r/t/comments/a/x/', 'video');
    expect(m.pollJobUntilComplete).toHaveBeenCalledWith('jurl', expect.anything());
  });

  it('a failed browser fetch falls back to the server only if enabled', async () => {
    m.fetchMediaBlob.mockRejectedValue(new MediaFetchError('403', 'NETWORK_ERROR', 403));
    const off = await handleScanMedia(video([u('DASH_360.mp4')]));
    expect(off).toMatchObject({ type: 'ERROR', code: 'MEDIA_FETCH_FAILED' });
    expect(m.submitDetectUrl).not.toHaveBeenCalled();

    m.loadSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, enableUrlDetect: true });
    const on = await handleScanMedia(video([u('DASH_360.mp4')]));
    expect(on.type).toBe('JOB_STATUS');
    expect(m.submitDetectUrl).toHaveBeenCalledTimes(1);
  });

  it('maps a Reddit-blocked server download to a friendly message', async () => {
    m.loadSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, enableUrlDetect: true });
    m.submitDetectUrl.mockRejectedValue(new ApiClientError('x', 'HTTP_ERROR', 502, 'Reddit blocked server download.', 'REDDIT_BLOCKED'));
    const res = await handleScanMedia(video([u('HLSPlaylist.m3u8')]));
    expect(res).toMatchObject({ type: 'ERROR', code: 'REDDIT_BLOCKED', error: 'Reddit blocked the server download.' });
  });
});

describe('friendly errors', () => {
  const cases: Array<[string, unknown, string]> = [
    ['network', new ApiClientError('Failed to connect to http://secret', 'NETWORK_ERROR'), 'NETWORK_ERROR'],
    ['413', new ApiClientError('x', 'HTTP_ERROR', 413), 'FILE_TOO_LARGE'],
    ['415', new ApiClientError('x', 'HTTP_ERROR', 415), 'UNSUPPORTED_MEDIA_TYPE'],
    ['503', new ApiClientError('x', 'HTTP_ERROR', 503), 'SERVICE_UNAVAILABLE'],
    ['poll timeout', new PollerError('t', 'TIMEOUT'), 'TIMEOUT'],
    ['job failed', new PollerError('model exploded', 'FAILED'), 'JOB_FAILED'],
    ['media too big', new MediaFetchError('big', 'SIZE_EXCEEDED'), 'FILE_TOO_LARGE'],
    ['media timeout', new MediaFetchError('slow', 'TIMEOUT'), 'TIMEOUT'],
    ['media 404', new MediaFetchError('gone', 'NETWORK_ERROR', 404), 'MEDIA_FETCH_FAILED'],
    ['unknown', new Error('weird'), 'SCAN_FAILED'],
  ];

  it.each(cases)('%s -> %s with a message free of URLs and internals', async (_name, error, code) => {
    m.submitDetection.mockRejectedValue(error);
    m.pollJobUntilComplete.mockRejectedValue(error);
    m.fetchMediaBlob.mockImplementation(async (url: string) => {
      if (error instanceof MediaFetchError) throw error;
      return blob(url);
    });
    const res = await handleScanMedia(req());
    expect(res).toMatchObject({ type: 'ERROR', code });
    if (res.type === 'ERROR') {
      expect(res.error.length).toBeGreaterThan(10);
      expect(res.error).not.toMatch(/https?:|localhost|secret|exploded/);
    }
  });
});

describe('auto-scan rules', () => {
  const auto = (over: Partial<ScanMediaRequest['payload']> = {}) => req({ origin: 'auto', ...over });

  it('is refused while the setting is off', async () => {
    const res = await handleScanMedia(auto());
    expect(res).toMatchObject({ type: 'ERROR', code: 'AUTO_SCAN_DISABLED' });
    expect(m.fetchMediaBlob).not.toHaveBeenCalled();
  });

  it('never scans video, even when on', async () => {
    m.loadSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, enableAutoScan: true });
    const res = await handleScanMedia(auto({ mediaType: 'video', mediaUrls: [u('DASH_360.mp4')] }));
    expect(res).toMatchObject({ type: 'ERROR', code: 'AUTO_SCAN_DISABLED' });
  });

  it('is rate limited per minute and cached verdicts do not count', async () => {
    m.loadSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, enableAutoScan: true });
    const spy = vi.spyOn(queueModule.autoScanLimiter, 'tryAcquire').mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect((await handleScanMedia(auto({ postId: 't3_1' }))).type).toBe('JOB_STATUS');
    expect(await handleScanMedia(auto({ postId: 't3_2' }))).toMatchObject({ type: 'ERROR', code: 'RATE_LIMITED' });

    m.getCachedResult.mockResolvedValue({ result: job });
    expect((await handleScanMedia(auto({ postId: 't3_3' }))).type).toBe('JOB_STATUS');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

describe('queue integration', () => {
  it('identical in-flight scans share one upload', async () => {
    let release!: () => void;
    m.pollJobUntilComplete.mockImplementation(() => new Promise((res) => (release = () => res(job))));
    const a = handleScanMedia(req());
    const b = handleScanMedia(req());
    await vi.waitFor(() => expect(m.pollJobUntilComplete).toHaveBeenCalled());
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toEqual(rb);
    expect(m.submitDetection).toHaveBeenCalledTimes(1);
  });

  it('never runs more than 2 different scans at once', async () => {
    let running = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    m.pollJobUntilComplete.mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise<void>((res) => releases.push(res));
      running--;
      return job;
    });
    const all = [1, 2, 3, 4].map((i) =>
      handleScanMedia(req({ postId: `t3_${i}`, mediaUrls: [`https://i.redd.it/${i}.jpg`] })),
    );
    await vi.waitFor(() => expect(releases.length).toBe(2));
    expect(peak).toBe(2);
    while (releases.length) releases.shift()!();
    await vi.waitFor(() => expect(releases.length).toBe(2));
    while (releases.length) releases.shift()!();
    await Promise.all(all);
    expect(peak).toBe(2);
  });

  it('the shared singleton queue is configured for 2 concurrent scans', () => {
    expect(new ScanQueue().constructor).toBe(ScanQueue);
    expect(queueModule.MAX_CONCURRENT_SCANS).toBe(2);
  });
});
