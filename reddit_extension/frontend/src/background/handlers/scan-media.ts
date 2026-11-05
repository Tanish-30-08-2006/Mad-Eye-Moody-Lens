/**
 * background/handlers/scan-media.ts – Handler for scan requests (lens click, auto-scan, context menu).
 *
 * Order: consent gate -> cache -> auto-scan limits -> shared queue (dedupe + 2 at a time) ->
 * fetch media in the browser session -> upload -> poll -> cache the verdict.
 */

import { createLogger } from '../../core/logger';
import { fetchMediaBlob, MediaFetchError, type FetchedMedia } from '../media-fetcher';
import { submitDetection, submitDetectUrl } from '../../core/api-client';
import { pollJobUntilComplete } from '../job-poller';
import { startKeepalive, stopKeepalive } from '../keepalive';
import { getCachedResult, makeCacheKey, setCachedResult } from '../../core/cache';
import { getConsent } from '../../core/consent';
import { loadSettings } from '../../core/settings';
import type { ScanMediaRequest, ExtensionResponse } from '../../core/messaging';
import { pickRenditions } from '../rendition';
import { autoScanLimiter, scanQueue } from '../scan-queue';
import { ScanError, toFriendlyError } from '../errors';

const log = createLogger('scan-media-handler');

type ScanPayload = ScanMediaRequest['payload'];

function errorResponse(code: string, message: string): ExtensionResponse {
  return { type: 'ERROR', error: message, code };
}

/** Tries each progressive MP4 in turn; moves on when one is over the size cap or unavailable. */
async function fetchFirstUsable(candidates: string[]): Promise<FetchedMedia> {
  let lastError: unknown;
  for (const url of candidates.slice(0, 3)) {
    try {
      return await fetchMediaBlob(url);
    } catch (err) {
      lastError = err;
      const retryable = err instanceof MediaFetchError && (err.code === 'SIZE_EXCEEDED' || err.status === 403 || err.status === 404);
      if (!retryable) throw err;
    }
  }
  throw lastError;
}

/** Fetches media in the browser session and submits it; returns the backend job id. */
async function acquireAndSubmit(payload: ScanPayload, fallbackToServer: boolean): Promise<string> {
  const meta = { postId: payload.postId, permalink: payload.permalink, mediaType: payload.mediaType };

  if (payload.mediaType !== 'video') {
    const media = await fetchMediaBlob(payload.mediaUrls[0]!);
    return (await submitDetection(media.blob, undefined, meta)).job_id;
  }

  const choice = pickRenditions(payload.mediaUrls);
  // Tier-2: let the backend download the post itself, only if the user enabled it.
  const viaServer = async () =>
    (await submitDetectUrl(new URL(payload.permalink, 'https://www.reddit.com').toString(), 'video')).job_id;

  if (choice.candidates.length === 0) {
    if (fallbackToServer) return viaServer();
    throw new ScanError('Video format not supported yet.', 'UNSUPPORTED_VIDEO');
  }

  let video: FetchedMedia;
  try {
    video = await fetchFirstUsable(choice.candidates);
  } catch (err) {
    if (fallbackToServer) {
      log.warn('Browser video fetch failed; using server fallback.');
      return viaServer();
    }
    throw err;
  }

  // Silent videos have no audio URL; a failed audio fetch degrades to video-only analysis.
  let audio: Blob | undefined;
  if (payload.audioUrl) {
    try {
      audio = (await fetchMediaBlob(payload.audioUrl)).blob;
    } catch (err) {
      log.warn('Could not fetch the audio track; scanning video only.', err instanceof Error ? err.name : '');
    }
  }
  return (await submitDetection(video.blob, audio, meta)).job_id;
}

async function performScan(payload: ScanPayload, cacheUrl: string): Promise<ExtensionResponse> {
  startKeepalive();
  try {
    const settings = await loadSettings();
    const jobId = await acquireAndSubmit(payload, settings.enableUrlDetect);
    log.info(`Job ${jobId} created for post ${payload.postId}; polling.`);

    const job = await pollJobUntilComplete(jobId, { postId: payload.postId, mediaType: payload.mediaType });
    if (job.status === 'completed') {
      await setCachedResult(payload.postId, cacheUrl, job);
    }
    return { type: 'JOB_STATUS', status: job.status, result: job };
  } finally {
    stopKeepalive();
  }
}

/**
 * Handle a SCAN_MEDIA message. Never throws: every failure becomes a friendly ERROR response.
 */
export async function handleScanMedia(request: ScanMediaRequest): Promise<ExtensionResponse> {
  const { payload } = request;
  const primaryUrl = payload.mediaUrls[0];
  if (!primaryUrl) return errorResponse('VALIDATION_ERROR', 'No media URLs provided in request');

  try {
    if (!(await getConsent())) {
      return errorResponse('CONSENT_REQUIRED', toFriendlyError(new ScanError('', 'CONSENT_REQUIRED')).message);
    }

    // Cached verdicts are free, so they bypass the auto-scan caps below.
    const cached = await getCachedResult(payload.postId, primaryUrl);
    if (cached) {
      log.debug(`Cache hit for post ${payload.postId}`);
      return { type: 'JOB_STATUS', status: cached.result.status, result: cached.result };
    }

    if (payload.origin === 'auto') {
      const settings = await loadSettings();
      // Auto-scan never touches video and only runs when the user turned it on.
      if (!settings.enableAutoScan || payload.mediaType !== 'image') {
        const f = toFriendlyError(new ScanError('', 'AUTO_SCAN_DISABLED'));
        return errorResponse(f.code, f.message);
      }
      if (!autoScanLimiter.tryAcquire()) {
        const f = toFriendlyError(new ScanError('', 'RATE_LIMITED'));
        return errorResponse(f.code, f.message);
      }
    }

    return await scanQueue.run(makeCacheKey(payload.postId, primaryUrl), () => performScan(payload, primaryUrl));
  } catch (err) {
    const f = toFriendlyError(err);
    log.warn(`Scan failed for post ${payload.postId}: ${f.code}`);
    log.debug('Scan failure detail:', err);
    return errorResponse(f.code, f.message);
  }
}
