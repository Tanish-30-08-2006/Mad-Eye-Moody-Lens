# Moody Lens Reddit API contract (v1)

The shared host serves the Reddit router at `/api/v1`. For the Sprint 2 Compose stack, the base URL is `http://localhost:8080`; the standalone dev stub defaults to `http://localhost:8000`. See the [deployment and detector runbook](../../backend/docs/BRAIN-INTEGRATION.md). The [extension schemas](../src/core/schema.ts) accept additive fields.

## Access, limits and errors

- Use `X-Client: extension` for extension calls (it selects the detailed liveness response). It is a client hint, not a credential. For JSON posts send `Content-Type: application/json`; let curl or the browser set the multipart boundary for uploads.
- Compose publishes nginx on loopback. The host's existing origin configuration (`MML_CORS_ORIGINS`, `MML_ALLOW_EXTENSION_CORS`, `MML_EXTENSION_ORIGIN_REGEX`) applies; CORS allows the extension's `X-Client` header. The existing host policy allows anonymous calls. An optional configured `X-API-Key` raises rate limits; it is not mandatory authentication.
- Host Redis rate limits apply to submissions and job polls. Default anonymous / keyed: fast **30 / 120 per minute**; video and URL **5 / 30 per ten minutes**; polls **120 / 600 per minute**. `429` includes `Retry-After`. One gallery request counts as one fast submission. Liveness does not depend on Redis.
- Host limits are **10 MiB image, 25 MiB standalone audio, 100 MiB video** by default via `MML_MAX_{IMAGE,AUDIO,VIDEO}_MB`. Separate audio is **50 MiB** via `MOODY_LENS_MAX_AUDIO_MB`; nginx caps the **whole multipart request** at 105 MiB, including all gallery items and both video parts. nginx can send a non-JSON `413`. Host validation sniffs actual bytes and checks decoder/container structure, image pixels (40 million), video height (2160) and audio/video duration (600 s host ceiling). The Reddit-specific video ceiling is **180 s** via `MOODY_LENS_MAX_VIDEO_SECONDS`. The host still applies its own limits.
- Host formats: **image** JPEG, PNG, WebP; **audio** WAV, MP3, FLAC, Ogg, M4A/MP4 with an audio stream; **video** MP4, MOV, WebM, Matroska, AVI with a video stream. Split tracks must be stream-copy compatible with MP4. The standalone stub is for development and uses lighter validation.
- API failures generally return `{"error":"…","code":"…","detail":"…"}` with the last two fields optional. Framework input validation can instead return a `422` with a `detail` array. Host rate limit and general error handlers return `{"error":"…"}`.

## Endpoint inventory

Paths below all start with `/api/v1`. Jobs are created by the Reddit router; the host owns inference, and no second inference worker runs in the API.

| Method and path | Caller, request and success | Errors | Readiness / owner |
|---|---|---|---|
| **POST** `/detect` | In-feed scans, draft attachment scans, audio API clients. Multipart `media` or legacy `file` (if both, `media` wins), `media_type=image\|audio\|video` (default image), optional `source_url` and `post_id` (accepted for compatibility; neither is stored or part of the cache key). Optional `audio` file is video-only. **202** `{"job_id":"job-…"}`. | 400 invalid kind or audio usage; 413 size/duration; 415 unsupported format/track/mux; 422 missing or malformed media; 429 rate limit; 503 unavailable or `VIDEO_BUSY`; 504 split-track preparation timeout. Inference errors after validation are recorded on the job. | Ready fast worker for image/audio, video worker for video. Host validates upload. Fast dispatch waits for the result; video returns the ID **before inference**, after local validation/hashing and optional mux. Exact cache hits can already be completed. |
| **POST** `/detect/batch` | Gallery scan. Multipart repeated `media`, **1–10 images**, in input order. **202** `{"job_id":"job-…"}`. All parts pass upload validation before acceptance. Inference failures are per item; a good item can still produce a verdict. | 400 more than 10 items; 413 size; 415 format; 422 missing or invalid upload; 429 rate limit; 503 fast worker unavailable or `GALLERY_BUSY`. | Reddit job orchestration; sequential calls to the host fast dispatcher, exact cache per image. |
| **GET** `/jobs/{job_id}` | Extension polls a `job-…` ID. **200** `DetectionJob` below. Web app polls the ID from `/analyze/video` and sees its existing `JobStatus` (`queued/running/done/failed`, `progress`, `stage`, nested `result`, `error`). The ID determines the shape. | 404 unknown, expired or lost extension ID; 429 rate limit; 500 host infrastructure failure as applicable. | One GET route. Extension snapshot is process-local; native jobs use host PostgreSQL + Redis. The GET does not require a live inference worker. |
| **GET** `/health` | Liveness and extension Options. **200** `{"status":"ok"}`; with `X-Client: extension` or `?details=1` also `version`, `models_available` (array of model keys) and `mock` (boolean). | A serving API returns 200 even with no workers. A proxy or unreachable API can fail separately. | API process; detailed compatibility fields are best effort. Use brain status for inference readiness. |
| **GET** `/brain/status` | Extension Options and deploy checks. **200** `{name,version,capabilities,is_mock,healthy,readiness,models}`; schema below. | 503 `SERVICE_UNAVAILABLE` if the configured brain cannot be selected (e.g. auto with no usable brain or fallback). In host mode with no worker, returns 200 with false readiness. | Host reads recent worker heartbeats. Fast readiness covers image and audio (and the face check on images); video readiness is independent. |
| **POST** `/detect-url` | Optional in-feed server fallback. JSON `{"url":"https://www.reddit.com/r/.../comments/…/","media_type":"video"}` (video default). **202** `{"job_id":"job-…"}` once admitted. Downloads and validates before **inference**, after the response. | 501 disabled; 400 unsupported kind or URL; 422 malformed JSON; 429 rate limit; 503 worker/tools unavailable or `VIDEO_BUSY`. After 202, poll for `failed` with `error_code` such as `REDDIT_BLOCKED`, `DOWNLOAD_FAILED`, `PROCESSING_TIMEOUT`, `VIDEO_TOO_LONG`, `FILE_TOO_LARGE` or `UNSUPPORTED_MEDIA_TYPE`. | Uses same video slots, host dispatcher and store as video uploads. Off by default. Requires ffmpeg, ffprobe and optional yt-dlp. |
| **GET** `/verdicts/lookup` | Image repost shortcut or API caller's exact lookup. Query `sha256` (64 hex, the following cache key). **200** completed `DetectionJob` with synthetic `cached-…` ID, not a pollable job. | 400 malformed hash; 404 miss or no selectable/cacheable brain. | Extension SQLite. Selects the active brain namespace; lookup does not submit work. |
| **POST** `/feedback` | Extension verdict controls. JSON `{cache_key,verdict_label,user_label,note?}`. Key is 64 hex, verdict uses v1 labels, user label is `looks_right\|looks_wrong`, note ≤500 chars. **201** `{"ok":true}`. | 422 invalid input; 500 store failure. No cache hit is required. | Extension SQLite, independent of worker readiness. Stores key, labels, optional note, timestamp and internal row ID. No uploaded media or account ID; avoid personal information in notes. No automatic expiry: operator owns purge and volume retention. |
| **GET** `/jobs/{job_id}/explain` | Optional extension/API capability. **200** `{job_id,summary,regions:[{x,y,w,h,score,note}],mock}`; normalized coordinates. | 501 unsupported for current host/stub or no explanation; 404 unknown/expired job with a capable brain; 410 `EXPLAIN_EXPIRED` for a known job with no retained file (expired, evicted, or never kept); 422 explanation failed; 503 no usable brain. | Capability gate first. A custom capable brain can keep at most 20 local files for 10 minutes of eligibility, cleaned during access/retention operations. Host web Grad-CAM is its own existing analysis endpoint. |

The URL fallback accepts HTTPS Reddit post permalinks only, on the explicit `reddit.com`, `www`, `old`, `sh`, or `np` host list and default HTTPS port without credentials. The downloader disables playlist and local config, prefers ≤480p where available, checks size and duration, and has a **90 s** process deadline, **20 s** socket timeout and one retry. Default download cap: **50 MiB** (`MOODY_LENS_MAX_DOWNLOAD_MB`). It is opt-in with `MML_FEATURE_DETECT_URL=true` (explicit `FEATURE_DETECT_URL` takes precedence). Moving the download after the response keeps the existing 202/poll shape usable through the 60 s proxy; pre-inference download errors now appear on the job.

## Response shapes and job lifecycle

```ts
type ModelScore = { score: number; label: string; confidence: number; model_id?: string | null };
type VerdictFields = {
  overall_score?: number | null;                  // 0–1 detector aggregate
  label?: "likely_real" | "likely_fake" | "inconclusive" | null;
  models?: { image: ModelScore | null; face: ModelScore | null; audio: ModelScore | null } | null;
  model_versions?: Record<string, string> | null; // actual model ID -> runtime revision or "unpinned"/"stub"
  mock?: boolean | null;
  timeline?: { start: number; end: number; score: number }[] | null; // detector ranges in seconds
  signals?: { kind: string; text: string; severity: "info" | "low" | "medium" | "high" }[] | null;
};
type DetectionJob = VerdictFields & {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  cache_key?: string | null;
  items?: (VerdictFields & {
    index: number; status: "completed" | "failed"; cache_key?: string | null; error?: string | null;
  })[] | null;
  error?: string | null;
  error_code?: string | null;
  created_at: string; updated_at: string;         // ISO 8601 UTC
};
type BrainStatus = {
  name: string; version: string; is_mock: boolean; healthy: boolean;
  capabilities: { image: boolean; face: boolean; audio: boolean; video: boolean; explain: boolean };
  readiness: { image: boolean; audio: boolean; video: boolean };
  models: Record<string, {
    configured_id: string; configured_revision: string | null;
    state: "configured" | "loaded" | "unavailable";
    loaded: { model_id: string; revision: string }[];
  }>;
};
```

Nullable result fields can be `null` while pending, on failure, or where the data is unavailable. A null per-model score explicitly means the check did not run (e.g. no face on an image or missing/silent/undecodable video audio). `confidence` is distance from 0.5 rescaled to 0–1; scores are not forensic proof or calibrated confidence. Timeline is absent or null when no measured localization is available. Any demo result carries `mock: true`; a gallery with any demo verdict is also marked as demo. Never use a demo result as verification evidence. Gallery indexes are zero-based within the submitted parts. Top-level verdict fields describe the highest scoring successful item (first in order on ties); if all fail, the job fails and still returns the items.

`pending` means accepted; `processing` means work has started or is waiting on a host queue. The extension snapshot does not measure progress, so it does not send a percent. The web app continues to get measured frame progress from the native video job. Poll with backoff (extension: 1 s initially up to 8 s; budgets image 60 s, audio 120 s, gallery 360 s, video 480 s). Extension terminal jobs expire after `MML_JOB_TTL_H` (24 h default), or immediately when the API process restarts. A cache verdict can outlive the job. There is no extension cancellation endpoint; host `DELETE /jobs/{id}` applies only to native IDs. At its deadline the adapter requests cancellation of its underlying host video job.

For brain status, `healthy` means **at least one** media route is ready; check `readiness` for a specific route. A loaded model may serve another queue even when the expected queue is unavailable. `configured` means a relevant live worker reports the key without a loaded model; `unavailable` means there is no relevant observation. `loaded` lists the reported identities, including divergent versions if workers are misconfigured. Stub and auto fallback may have an empty model map; auto status describes the currently selected brain and is unsuitable as a strict deployment readiness probe. Use `MML_BRAIN=host` and host `/ready` for deployment.

### Exact keys

- Image: lowercase SHA-256 of the original bytes.
- Audio or video: SHA-256 of the ASCII string `<kind>:<media SHA-256>:<separate audio SHA-256 or ->`, all hashes lowercase. Compute on the original files **before** muxing. The same video with no track, track A and track B has three distinct keys.
- Lookup without `phash` and all submit cache checks are exact. The legacy optional `phash` (16 hex) explicitly requests an image similarity fallback on an exact miss, when ImageHash is installed and values have been recorded. A fallback returns the matched image's key. It is neither exact evidence nor used by the extension. Do not pass it for audio or video.
- Cache keys are separate from the internal version namespace. The worker mode, model identities/pins and result-affecting host settings scope reuse. Host real mode bypasses the verdict cache if artifacts lack immutable pins or a loaded worker reports a different identity. Keep API and worker revisions and settings identical, and bump the brain namespace when changing detector code or preprocessing. Cache rows are retained in the extension SQLite volume until operator purge.

## Runnable examples

Generate synthetic, consent-free transport fixtures with ffmpeg (run in Bash or Git Bash). These contain no people and say nothing about real detector accuracy. The **stub stack** should complete every submitted fixture; for real visual video checks use consented clips with visible faces.

```bash
mkdir -p fixtures
ffmpeg -y -f lavfi -i color=blue:s=160x120 -frames:v 1 -threads 1 fixtures/image.png
ffmpeg -y -f lavfi -i color=red:s=160x120 -frames:v 1 -threads 1 fixtures/other.png
ffmpeg -y -f lavfi -i testsrc2=s=160x120:r=10:d=2 -c:v libx264 -an fixtures/silent.mp4
ffmpeg -y -f lavfi -i sine=frequency=440:duration=2 -c:a aac fixtures/track-a.m4a
ffmpeg -y -f lavfi -i sine=frequency=880:duration=2 -c:a aac fixtures/track-b.m4a
API=http://localhost:8080/api/v1
CLIENT='X-Client: extension'
# If configured, also pass -H "X-API-Key: $MML_API_KEY".
curl -fsS "$API/health"
curl -fsS -H "$CLIENT" "$API/health"
curl -fsS -H "$CLIENT" "$API/brain/status"

image_id=$(curl -fsS -H "$CLIENT" -F 'media=@fixtures/image.png' -F media_type=image "$API/detect" | python -c 'import json,sys; print(json.load(sys.stdin)["job_id"])')
curl -fsS -H "$CLIENT" "$API/jobs/$image_id"
curl -fsS -H "$CLIENT" -F 'media=@fixtures/track-a.m4a' -F media_type=audio "$API/detect"
# Run each video submission separately and poll its ID before starting the next one.
curl -fsS -H "$CLIENT" -F 'media=@fixtures/silent.mp4' -F media_type=video "$API/detect"
curl -fsS -H "$CLIENT" -F 'media=@fixtures/silent.mp4' -F 'audio=@fixtures/track-a.m4a' -F media_type=video "$API/detect"
curl -fsS -H "$CLIENT" -F 'media=@fixtures/silent.mp4' -F 'audio=@fixtures/track-b.m4a' -F media_type=video "$API/detect"
curl -fsS -H "$CLIENT" -F 'media=@fixtures/image.png' -F 'media=@fixtures/other.png' "$API/detect/batch"
# Poll any returned job_id as above until completed or failed. Allow rate-limit windows between long smoke runs.

key=$(python -c 'import hashlib,pathlib; print(hashlib.sha256(pathlib.Path("fixtures/image.png").read_bytes()).hexdigest())')
curl -fsS -H "$CLIENT" "$API/verdicts/lookup?sha256=$key"
label=$(curl -fsS -H "$CLIENT" "$API/jobs/$image_id" | python -c 'import json,sys; print(json.load(sys.stdin)["label"])')
curl -fsS -H "$CLIENT" -H 'Content-Type: application/json' \
  -d "{\"cache_key\":\"$key\",\"verdict_label\":\"$label\",\"user_label\":\"looks_right\"}" "$API/feedback"

# Expect 501 from the host adapter:
curl -sS -i -H "$CLIENT" "$API/jobs/$image_id/explain"
# Expect 501 by default. Only replace this example permalink on a resolver-enabled deployment.
curl -sS -i -H "$CLIENT" -H 'Content-Type: application/json' \
  -d '{"url":"https://www.reddit.com/r/example/comments/abc123/example/","media_type":"video"}' "$API/detect-url"
# Native job compatibility: native POST and poll, without the extension header.
curl -fsS -F 'file=@fixtures/silent.mp4' "$API/analyze/video"
```
