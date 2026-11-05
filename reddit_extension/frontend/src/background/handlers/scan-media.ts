/**
 * background/handlers/scan-media.ts – Handler for scan media requests from content scripts.
 *
 * Coordinates caching, session keepalive, allowlisted media fetching, backend job dispatch,
 * and polling backoff.
 */

import { createLogger } from '../../core/logger';
import { fetchMediaBlob } from '../media-fetcher';
import { submitDetection } from '../../core/api-client';
import { pollJobUntilComplete } from '../job-poller';
import { startKeepalive, stopKeepalive } from '../keepalive';
import { getCachedResult, setCachedResult } from '../../core/cache';
import type { ScanMediaRequest, ExtensionResponse } from '../../core/messaging';

const log = createLogger('scan-media-handler');

/**
 * Handle a SCAN_MEDIA message from a content script.
 */
export async function handleScanMedia(
  request: ScanMediaRequest,
): Promise<ExtensionResponse> {
  const { payload } = request;
  const primaryUrl = payload.mediaUrls[0];
  log.info(`Processing SCAN_MEDIA for post: ${payload.postId} (media: ${primaryUrl})`);

  if (!primaryUrl) {
    return {
      type: 'ERROR',
      error: 'No media URLs provided in request',
      code: 'VALIDATION_ERROR',
    };
  }

  // 1. Check result cache
  try {
    const cached = await getCachedResult(payload.postId, primaryUrl);
    if (cached) {
      log.info(`Returning cached result for post: ${payload.postId}`);
      return {
        type: 'JOB_STATUS',
        status: cached.result.status,
        result: cached.result,
      };
    }
  } catch (err) {
    log.warn('Cache lookup failed, proceeding with fresh scan:', err);
  }

  // 2. Start keepalive to prevent worker termination mid-job
  startKeepalive();

  try {
    // 3. Fetch media payload through session-aware fetcher with allowlist check
    const fetchedMedia = await fetchMediaBlob(primaryUrl);

    let fetchedAudioBlob: Blob | undefined = undefined;
    if (payload.audioUrl) {
      try {
        const fetchedAudio = await fetchMediaBlob(payload.audioUrl);
        fetchedAudioBlob = fetchedAudio.blob;
      } catch (audioErr) {
        log.warn(`Could not fetch secondary audio track: ${audioErr}`);
      }
    }

    // 4. Submit detection to backend
    const detectResponse = await submitDetection(
      fetchedMedia.blob,
      fetchedAudioBlob,
      {
        postId: payload.postId,
        permalink: payload.permalink,
        mediaType: payload.mediaType,
      },
    );

    const jobId = detectResponse.job_id;
    log.info(`Job created on backend with ID: ${jobId}, starting polling...`);

    // 5. Poll job until completion
    const finalJob = await pollJobUntilComplete(jobId, {
      postId: payload.postId,
      mediaType: payload.mediaType,
    });

    // 6. Cache completed verdict
    if (finalJob.status === 'completed') {
      await setCachedResult(payload.postId, primaryUrl, finalJob);
    }

    return {
      type: 'JOB_STATUS',
      status: finalJob.status,
      result: finalJob,
    };
  } catch (err) {
    log.error(`Scan media failed for post ${payload.postId}:`, err);
    return {
      type: 'ERROR',
      error: err instanceof Error ? err.message : String(err),
      code: (err && typeof err === 'object' && 'code' in err) ? String(err.code) : 'SCAN_FAILED',
    };
  } finally {
    stopKeepalive();
  }
}
