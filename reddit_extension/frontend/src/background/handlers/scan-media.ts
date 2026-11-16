/**
 * background/handlers/scan-media.ts – Handler for scan requests (lens click, auto-scan, popup, context menu).
 *
 * Order: consent gate (not needed in local-only mode) -> auto-scan limits -> shared queue
 * (dedupe + 2 at a time) -> resolve media if the page gave none -> fetch in the browser session ->
 * local hints -> hash lookup -> upload (single, gallery batch or video + audio) -> poll -> cache + history.
 */

import { createLogger } from '../../core/logger';
import { sha256 } from '../fingerprint';
import { fetchMediaBlob, fetchText, MediaFetchError, type FetchedMedia } from '../media-fetcher';
import { lookupVerdict, submitBatch, submitDetection, submitDetectUrl } from '../../core/api-client';
import { pollJobUntilComplete } from '../job-poller';
import { startKeepalive, stopKeepalive } from '../keepalive';
import { getConsent } from '../../core/consent';
import { addHistory } from '../../core/history';
import { hintsFromBlob } from '../../core/hints';
import { loadSettings, type ExtensionSettings } from '../../core/settings';
import type { ScanMeta } from '../../core/scan-meta';
import type { DetectionJob } from '../../core/schema';
import { verdictOf } from '../../core/verdict';
import type { ScanMediaRequest, ExtensionResponse } from '../../core/messaging';
import { resolveAudio } from '../dash-audio';
import { MAX_GALLERY_IMAGES, resolveFromPostJson } from '../post-json';
import { pickRenditions } from '../rendition';
import { autoScanLimiter, scanQueue } from '../scan-queue';
import { ScanError, toFriendlyError } from '../errors';

const log = createLogger('scan-media-handler');

type ScanPayload = ScanMediaRequest['payload'];

/** What a scan produced before it is wrapped into a response. */
function errorResponse(code: string, message: string): ExtensionResponse {
  return { type: 'ERROR', error: message, code };
}

/** Tries each progressive MP4 in turn; moves on when one is over the size cap or unavailable. */
async function fetchFirstUsable(candidates: string[]): Promise<FetchedMedia & { url: string }> {
  let lastError: unknown;
  for (const url of candidates.slice(0, 3)) {
    try {
      return { ...(await fetchMediaBlob(url)), url };
    } catch (err) {
      lastError = err;
      const retryable = err instanceof MediaFetchError && (err.code === 'SIZE_EXCEEDED' || err.status === 403 || err.status === 404);
      if (!retryable) throw err;
    }
  }
  throw lastError;
}

/** Downloads gallery images three at a time; failures are counted, not fatal. */
async function fetchGallery(urls: string[]): Promise<{ blobs: Blob[]; indices: number[]; missing: number }> {
  const capped = urls.slice(0, MAX_GALLERY_IMAGES);
  const blobs: Blob[] = [];
  const indices: number[] = [];
  let lastError: unknown;
  for (let i = 0; i < capped.length; i += 3) {
    const results = await Promise.allSettled(capped.slice(i, i + 3).map((u) => fetchMediaBlob(u)));
    for (const [offset, r] of results.entries()) {
      if (r.status === 'fulfilled') {
        blobs.push(r.value.blob);
        indices.push(i + offset);
      }
      else lastError = r.reason;
    }
  }
  if (blobs.length === 0) throw lastError ?? new MediaFetchError('No gallery image could be downloaded.', 'NETWORK_ERROR');
  return { blobs, indices, missing: urls.length - blobs.length };
}

/** Waits for the job unless the backend already knew this media (hash cache hit). */
async function finishJob(jobId: string, payload: ScanPayload): Promise<DetectionJob> {
  log.info(`Job ${jobId} created for post ${payload.postId}; polling.`);
  return pollJobUntilComplete(jobId, { postId: payload.postId, mediaType: payload.gallery ? 'gallery' : payload.mediaType });
}

/** Fetches the video's audio track (from the DOM hint or the DASH manifest); notes when it could not be scanned. */
async function fetchAudio(payload: ScanPayload, videoUrl: string, mpdUrl: string | undefined, meta: ScanMeta): Promise<Blob | undefined> {
  let audioUrl = payload.audioUrl;
  if (!audioUrl) {
    const found = await resolveAudio(videoUrl, fetchText, mpdUrl);
    if (found.status === 'failed') meta.audioNotScanned = true;
    if (found.status !== 'found') return undefined;
    audioUrl = found.url;
  }
  try {
    return (await fetchMediaBlob(audioUrl)).blob;
  } catch (err) {
    // A failed audio fetch degrades to a video-only scan, and the UI says so.
    log.warn('Could not fetch the audio track; scanning video only.', err instanceof Error ? err.name : '');
    meta.audioNotScanned = true;
    return undefined;
  }
}

async function scanImages(payload: ScanPayload, meta: ScanMeta): Promise<DetectionJob> {
  const submitMeta = { postId: payload.postId, permalink: payload.permalink };

  if (payload.gallery) {
    const { blobs, indices, missing } = await fetchGallery(payload.mediaUrls);
    if (missing > 0) meta.galleryMissing = missing;
    meta.exactScope = 'gallery';
    meta.hints = dedupeHints((await Promise.all(blobs.map(hintsFromBlob))).flat());
    const job = await finishJob((await submitBatch(blobs, submitMeta)).job_id, payload);
    return {
      ...job,
      items: job.items?.flatMap((item) => indices[item.index] === undefined ? [] : [{ ...item, index: indices[item.index]! }]),
    };
  }

  const media = await fetchMediaBlob(payload.mediaUrls[0]!);
  meta.exactScope = 'image';
  meta.hints = await hintsFromBlob(media.blob);
  // Reposts are common: a known hash is answered from the backend's cache without uploading.
  const known = await lookupVerdict(await sha256(media.blob));
  if (known) {
    meta.fromHashCache = true;
    return known;
  }
  return finishJob((await submitDetection(media.blob, undefined, { ...submitMeta, mediaType: payload.mediaType })).job_id, payload);
}

async function scanVideo(payload: ScanPayload, mpdUrl: string | undefined, fallbackToServer: boolean, meta: ScanMeta): Promise<DetectionJob> {
  const choice = pickRenditions(payload.mediaUrls);
  // Tier-2: let the backend download the post itself, only if the user enabled it.
  const viaServer = async () =>
    finishJob((await submitDetectUrl(new URL(payload.permalink, 'https://www.reddit.com').toString(), 'video')).job_id, payload);

  if (choice.candidates.length === 0) {
    if (fallbackToServer) return viaServer();
    throw new ScanError('Video format not supported yet.', 'UNSUPPORTED_VIDEO');
  }

  let video: FetchedMedia & { url: string };
  try {
    video = await fetchFirstUsable(choice.candidates);
  } catch (err) {
    if (fallbackToServer) {
      log.warn('Browser video fetch failed; using server fallback.');
      return viaServer();
    }
    throw err;
  }

  meta.hints = await hintsFromBlob(video.blob);
  meta.exactScope = 'video';
  const audio = await fetchAudio(payload, video.url, mpdUrl, meta);
  const submitted = await submitDetection(video.blob, audio, {
    postId: payload.postId,
    permalink: payload.permalink,
    mediaType: payload.mediaType,
  });
  return finishJob(submitted.job_id, payload);
}

function dedupeHints(hints: NonNullable<ScanMeta['hints']>): NonNullable<ScanMeta['hints']> {
  const seen = new Set<string>();
  return hints.filter((h) => (seen.has(h.text) ? false : (seen.add(h.text), true)));
}

/** Local-only mode: fetch the media in the browser and report metadata hints; nothing is uploaded. */
async function scanLocally(payload: ScanPayload): Promise<ExtensionResponse> {
  const urls = payload.mediaType === 'video' ? pickRenditions(payload.mediaUrls).candidates.slice(0, 1) : payload.mediaUrls.slice(0, MAX_GALLERY_IMAGES);
  if (urls.length === 0) throw new ScanError('Video format not supported yet.', 'UNSUPPORTED_VIDEO');
  const hints: NonNullable<ScanMeta['hints']> = [];
  for (const url of urls) hints.push(...(await hintsFromBlob((await fetchMediaBlob(url)).blob)));
  const unique = dedupeHints(hints);
  return { type: 'LOCAL_HINTS', hints: unique, meta: { localOnly: true, hints: unique } };
}

/** Looks the media up from the post JSON when the page gave us none. */
async function withResolvedMedia(payload: ScanPayload): Promise<{ payload: ScanPayload; mpdUrl?: string }> {
  if (payload.mediaUrls.length > 0) return { payload };
  const resolved = await resolveFromPostJson(new URL(payload.permalink, 'https://www.reddit.com').toString());
  if (!resolved) throw new ScanError('', 'NO_MEDIA');
  return {
    payload: { ...payload, mediaUrls: resolved.urls, mediaType: resolved.mediaType, kind: resolved.kind, gallery: resolved.kind === 'gallery' },
    mpdUrl: resolved.mpdUrl,
  };
}

async function record(settings: ExtensionSettings, payload: ScanPayload, job: DetectionJob): Promise<void> {
  if (job.status !== 'completed') return;
  if (settings.saveHistory) {
    await addHistory({
      postId: payload.postId,
      permalink: payload.permalink,
      kind: payload.kind ?? (payload.mediaType === 'video' ? 'video' : 'image'),
      score: typeof job.overall_score === 'number' ? job.overall_score : null,
      label: verdictOf(job, { realBelow: settings.realBelow, fakeAbove: settings.fakeAbove }),
      mock: job.mock === true,
      time: Date.now(),
    });
  }
}

async function performScan(request: ScanPayload, settings: ExtensionSettings): Promise<ExtensionResponse> {
  startKeepalive();
  try {
    const { payload, mpdUrl } = await withResolvedMedia(request);
    if (settings.localOnly) return await scanLocally(payload);

    const meta: ScanMeta = {};
    const job =
      payload.mediaType === 'video'
        ? await scanVideo(payload, mpdUrl, settings.enableUrlDetect, meta)
        : await scanImages(payload, meta);
    if (request.mediaUrls.length === 0) delete meta.exactScope;
    await record(settings, payload, job);
    return { type: 'JOB_STATUS', status: job.status, result: job, meta };
  } finally {
    stopKeepalive();
  }
}

/**
 * Handle a SCAN_MEDIA message. Never throws: every failure becomes a friendly ERROR response.
 */
export async function handleScanMedia(request: ScanMediaRequest): Promise<ExtensionResponse> {
  const { payload } = request;
  try {
    const settings = await loadSettings();
    const scanKey = JSON.stringify([settings.apiUrl, settings.localOnly, payload.postId, payload.mediaUrls, payload.audioUrl, payload.kind, payload.mediaType, payload.resolve ? payload.permalink : null]);
    // Local-only mode never uploads, so it needs no upload consent.
    if (!settings.localOnly && !(await getConsent())) {
      return errorResponse('CONSENT_REQUIRED', toFriendlyError(new ScanError('', 'CONSENT_REQUIRED')).message);
    }

    if (payload.origin === 'auto' || payload.origin === 'visible') {
      // Neither ever touches video. Only true auto-scan also needs the user's opt-in.
      const autoOff = payload.origin === 'auto' && !settings.enableAutoScan;
      if (autoOff || payload.mediaType !== 'image') {
        const f = toFriendlyError(new ScanError('', 'AUTO_SCAN_DISABLED'));
        return errorResponse(f.code, f.message);
      }
      if (!autoScanLimiter.tryAcquire()) {
        const f = toFriendlyError(new ScanError('', 'RATE_LIMITED'));
        return errorResponse(f.code, f.message);
      }
    }

    return await scanQueue.run(scanKey, () => performScan(payload, settings));
  } catch (err) {
    const f = toFriendlyError(err);
    log.warn(`Scan failed for post ${payload.postId}: ${f.code}`);
    log.debug('Scan failure detail:', err);
    return errorResponse(f.code, f.message);
  }
}
