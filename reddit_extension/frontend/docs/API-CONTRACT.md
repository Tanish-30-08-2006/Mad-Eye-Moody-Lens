# Moody Lens — API Contract (v1)

> **Version:** 1.0.0-draft · **Last updated:** 2026-11-02  
> **Base URL:** `http://localhost:8000`  
> **Protocol:** HTTP/1.1 (localhost only, no TLS for v1)  
> **Branch:** `darshan-dev`

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Versioning Strategy](#2-versioning-strategy)
- [3. Authentication](#3-authentication)
- [4. CORS Requirements](#4-cors-requirements)
- [5. Common Error Format](#5-common-error-format)
- [6. Rate Limiting](#6-rate-limiting)
- [7. Size Limits](#7-size-limits)
- [8. Endpoints](#8-endpoints)
  - [8.1 POST /api/v1/detect](#81-post-apiv1detect)
  - [8.2 GET /api/v1/jobs/{job_id}](#82-get-apiv1jobsjob_id)
  - [8.3 GET /api/v1/health](#83-get-apiv1health)
  - [8.4 POST /api/v1/detect-url](#84-post-apiv1detect-url)
- [9. Legacy Endpoints](#9-legacy-endpoints)
- [10. Zod Schemas](#10-zod-schemas)
- [11. Polling Strategy](#11-polling-strategy)

---

## 1. Overview

The Moody Lens backend exposes a **job-based asynchronous API** for deepfake detection. The flow is:

1. **Submit** media via `POST /api/v1/detect` → receive a `job_id` (HTTP 202)
2. **Poll** job status via `GET /api/v1/jobs/{job_id}` until `status` is `completed` or `failed`
3. **Read** the verdict from the completed job response

This design allows the backend to run multiple ML models (image, face, audio) without blocking the HTTP connection, and allows the extension's service worker to checkpoint and resume jobs across restarts.

---

## 2. Versioning Strategy

| Aspect | Strategy |
|--------|----------|
| **URL prefix** | `/api/v1/` — major version in URL path |
| **Breaking changes** | Increment major version → `/api/v2/` |
| **Additive changes** | New optional fields, new endpoints — no version bump |
| **Deprecation** | Old version serves for ≥ 6 months with `Deprecation` header |
| **Content-Type** | `multipart/form-data` for uploads, `application/json` for everything else |

---

## 3. Authentication

| Version | Auth Method |
|---------|------------|
| **v1 (current)** | **None** — localhost-only access, no authentication required |
| **v2 (future)** | API key via `Authorization: Bearer <key>` header |

> [!NOTE]
> The backend binds to `127.0.0.1` only. The extension's service worker makes requests from the `chrome-extension://` origin. No network exposure is expected in v1.

---

## 4. CORS Requirements

The backend **must** allow requests from the Chrome extension origin:

```
Access-Control-Allow-Origin: chrome-extension://<extension-id>
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Max-Age: 86400
```

> [!IMPORTANT]
> The extension ID changes between development (unpacked) and production (Chrome Web Store). The backend should either:
> - Accept all `chrome-extension://` origins (recommended for v1/localhost), or
> - Read allowed extension IDs from an environment variable.

For the **mock server**, use `Access-Control-Allow-Origin: *` for simplicity.

---

## 5. Common Error Format

All error responses use a consistent JSON structure:

```json
{
  "error": "Human-readable error message",
  "detail": "Optional technical detail for debugging",
  "code": "OPTIONAL_ERROR_CODE"
}
```

### Error Codes

| Code | Meaning |
|------|---------|
| `VALIDATION_ERROR` | Request body or parameters failed validation |
| `FILE_TOO_LARGE` | Uploaded file exceeds size limit |
| `UNSUPPORTED_MEDIA_TYPE` | File type not supported |
| `JOB_NOT_FOUND` | Job ID does not exist |
| `SERVICE_UNAVAILABLE` | Backend or model service is down |
| `RATE_LIMITED` | Too many requests |
| `INTERNAL_ERROR` | Unexpected server error |
| `FFMPEG_UNAVAILABLE` | `ffmpeg`/`ffprobe` is not installed on the server (HTTP 503) |
| `VIDEO_TOO_LONG` | Video exceeds the duration cap, default 180 s (HTTP 413) |
| `PROCESSING_TIMEOUT` | ffmpeg or the downloader exceeded its time limit (HTTP 504) |
| `NOT_IMPLEMENTED` | `detect-url` is disabled (HTTP 501) |
| `REDDIT_BLOCKED` | Reddit refused the server-side download (HTTP 502) |
| `DOWNLOAD_FAILED` | The server-side download failed for another reason (HTTP 502) |
| `RESOLVER_UNAVAILABLE` | `yt-dlp` is not installed on the server (HTTP 503) |

---

## 6. Rate Limiting

> [!NOTE]
> Rate limiting is **optional for v1** (localhost single-user). Documented here for future-proofing and mock server compliance.

### Headers

All responses include rate-limit headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1730500000
```

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Max requests per window (60/minute for v1) |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |

### Rate Limit Exceeded Response

```
HTTP/1.1 429 Too Many Requests
Retry-After: 30

{
  "error": "Rate limit exceeded",
  "detail": "Try again in 30 seconds",
  "code": "RATE_LIMITED"
}
```

---

## 7. Size Limits

| Media Type | Max Size | Rationale |
|------------|----------|-----------|
| **Image** | 20 MB | Covers high-res photos, RAW unlikely from Reddit |
| **Video** | 500 MB | Reddit's max video is 1 GB but most are < 100 MB |
| **Audio** | 100 MB | Extracted audio tracks are typically small |

When a file exceeds the limit, the backend returns `413 Payload Too Large`:

```json
{
  "error": "File too large",
  "detail": "Image files must be under 20MB. Received: 25.3MB",
  "code": "FILE_TOO_LARGE"
}
```

> [!TIP]
> The extension should check file size **before** uploading to avoid unnecessary network usage. Size limits are defined in `core/constants.ts`.

---

## 8. Endpoints

### 8.1 POST /api/v1/detect

Submit media for deepfake analysis. Returns a job ID for polling.

#### Request

```
POST /api/v1/detect HTTP/1.1
Host: localhost:8000
Content-Type: multipart/form-data; boundary=----FormBoundary
```

#### Form Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `media` | `file` | ✅ Yes | The media file (image, video, or audio) |
| `audio` | `file` | ❌ No | Separate audio track for videos with split audio/video streams. Only valid with `media_type=video` (otherwise `400`). Max 50 MB (`MOODY_LENS_MAX_AUDIO_MB`) |
| `source_url` | `string` | ❌ No | Original URL where the media was found (for logging/dedup) |
| `post_id` | `string` | ❌ No | Reddit post ID (e.g., `t3_abc123`) for dedup and caching |
| `media_type` | `enum` | ✅ Yes | One of: `image`, `video`, `audio` |

#### Accepted Media Formats

| Type | Accepted MIME Types |
|------|-------------------|
| `image` | `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/avif` |
| `video` | `video/mp4`, `video/webm`, `video/quicktime`, `video/x-matroska` |
| `audio` | `audio/mpeg`, `audio/ogg`, `audio/wav`, `audio/webm`, `audio/mp4` |

#### Success Response

```
HTTP/1.1 202 Accepted
Content-Type: application/json
```

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Example: cURL

```bash
curl -X POST http://localhost:8000/api/v1/detect \
  -F "media=@photo.jpg" \
  -F "media_type=image" \
  -F "source_url=https://i.redd.it/abc123.jpg" \
  -F "post_id=t3_xyz789"
```

#### Example: Video with Separate Audio

```bash
curl -X POST http://localhost:8000/api/v1/detect \
  -F "media=@video.mp4" \
  -F "audio=@audio.mp4" \
  -F "media_type=video" \
  -F "source_url=https://v.redd.it/abc123/DASH_720.mp4" \
  -F "post_id=t3_xyz789"
```

#### Video with a separate audio part

When `audio` is present the server probes both files with `ffprobe` (the audio part must contain an audio stream, the video part a video stream), then stream-copies them into ONE MP4 (`ffmpeg -c copy`) and analyses that file, so the existing single-file video task works unchanged. Temp files are always deleted. Without `audio`, a video is analysed as uploaded (a silent video is not an error; the audio detector simply reports `null`). Videos longer than 180 s (`MOODY_LENS_MAX_VIDEO_SECONDS`) are rejected with `413 VIDEO_TOO_LONG`.

#### Error Responses

| Status | Condition | Example Body |
|--------|-----------|-------------|
| `400` | `audio` sent with a non-video `media_type` | `{ "error": "The 'audio' part is only valid with media_type=video.", "code": "VALIDATION_ERROR" }` |
| `413` | Video longer than the duration cap | `{ "error": "Video is 240s long; the limit is 180s.", "code": "VIDEO_TOO_LONG" }` |
| `415` | Audio part has no audio stream, or the pair cannot be combined | `{ "error": "The audio part has no audio stream.", "code": "UNSUPPORTED_MEDIA_TYPE" }` |
| `503` | `audio` sent but ffmpeg is not installed | `{ "error": "ffmpeg is not installed on the server, so this video cannot be processed.", "code": "FFMPEG_UNAVAILABLE" }` |
| `400` | Missing required field or invalid `media_type` | `{ "error": "Invalid media_type. Must be one of: image, video, audio", "code": "VALIDATION_ERROR" }` |
| `413` | File exceeds size limit | `{ "error": "File too large", "detail": "Video files must be under 500MB. Received: 612.4MB", "code": "FILE_TOO_LARGE" }` |
| `415` | Unsupported file format | `{ "error": "Unsupported media type", "detail": "Received application/pdf. Accepted: image/jpeg, image/png, image/gif, image/webp, image/avif", "code": "UNSUPPORTED_MEDIA_TYPE" }` |
| `503` | Backend model service unavailable | `{ "error": "Service unavailable", "detail": "ML model service is not responding", "code": "SERVICE_UNAVAILABLE" }` |

---

### 8.2 GET /api/v1/jobs/{job_id}

Poll the status of a detection job.

#### Request

```
GET /api/v1/jobs/550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
Host: localhost:8000
```

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `job_id` | `string` (UUID) | The job ID returned by `POST /api/v1/detect` |

#### Response Body

```typescript
{
  /** Current job status */
  status: "pending" | "processing" | "completed" | "failed";

  /** Overall deepfake probability score (0.0 = real, 1.0 = fake). Present when completed. */
  overall_score?: number;

  /** Human-readable label. Present when completed. */
  label?: "likely_real" | "likely_fake" | "inconclusive";

  /** Per-model results. Present when completed (may be partial). */
  models?: {
    image?: ModelResult;
    face?: ModelResult;
    audio?: ModelResult;
  };

  /** Versions of models used. Present when completed. */
  model_versions?: Record<string, string>;

  /** Whether the verdict was produced via mock/fallback in-process mode (DEMO DATA). */
  mock?: boolean;

  /** Error message if status is "failed". */
  error?: string;

  /** ISO 8601 timestamp when the job was created. */
  created_at: string;

  /** ISO 8601 timestamp of the last status update. */
  updated_at: string;
}
```

Where `ModelResult` is:

```typescript
{
  /** Model's raw score (0.0–1.0) */
  score: number;

  /** Model's classification label */
  label: string;

  /** Model's confidence in its prediction (0.0–1.0) */
  confidence: number;
}
```

#### Example: Pending Job

```
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "status": "pending",
  "created_at": "2026-11-02T10:30:00Z",
  "updated_at": "2026-11-02T10:30:00Z"
}
```

#### Example: Processing Job

```json
{
  "status": "processing",
  "created_at": "2026-11-02T10:30:00Z",
  "updated_at": "2026-11-02T10:30:02Z"
}
```

#### Example: Completed Job (Likely Fake)

```json
{
  "status": "completed",
  "overall_score": 0.87,
  "label": "likely_fake",
  "models": {
    "image": {
      "score": 0.91,
      "label": "fake",
      "confidence": 0.93
    },
    "face": {
      "score": 0.82,
      "label": "fake",
      "confidence": 0.85
    }
  },
  "model_versions": {
    "image": "efficientnet-v2.1.0",
    "face": "xception-v1.3.0"
  },
  "created_at": "2026-11-02T10:30:00Z",
  "updated_at": "2026-11-02T10:30:08Z"
}
```

#### Example: Completed Job (Likely Real)

```json
{
  "status": "completed",
  "overall_score": 0.12,
  "label": "likely_real",
  "models": {
    "image": {
      "score": 0.09,
      "label": "real",
      "confidence": 0.95
    },
    "face": {
      "score": 0.15,
      "label": "real",
      "confidence": 0.88
    }
  },
  "model_versions": {
    "image": "efficientnet-v2.1.0",
    "face": "xception-v1.3.0"
  },
  "created_at": "2026-11-02T10:30:00Z",
  "updated_at": "2026-11-02T10:30:06Z"
}
```

#### Example: Completed Job (Inconclusive)

```json
{
  "status": "completed",
  "overall_score": 0.48,
  "label": "inconclusive",
  "models": {
    "image": {
      "score": 0.52,
      "label": "uncertain",
      "confidence": 0.55
    }
  },
  "model_versions": {
    "image": "efficientnet-v2.1.0"
  },
  "created_at": "2026-11-02T10:30:00Z",
  "updated_at": "2026-11-02T10:30:05Z"
}
```

#### Example: Failed Job

```json
{
  "status": "failed",
  "error": "Model inference timeout after 60s",
  "created_at": "2026-11-02T10:30:00Z",
  "updated_at": "2026-11-02T10:31:00Z"
}
```

#### Error Responses

| Status | Condition | Example Body |
|--------|-----------|-------------|
| `404` | Job ID not found | `{ "error": "Job not found", "detail": "No job with ID 550e8400-e29b-41d4-a716-446655440000", "code": "JOB_NOT_FOUND" }` |

---

### 8.3 GET /api/v1/health

Check backend health and available models.

#### Request

```
GET /api/v1/health HTTP/1.1
Host: localhost:8000
```

#### Response Body

```typescript
{
  /** Overall backend status */
  status: "ok" | "degraded" | "down";

  /** Backend version string */
  version: string;

  /** List of currently loaded and available model names */
  models_available: string[];

  /** Optional. True when scans would be answered with demo/mock verdicts (no real workers). */
  mock?: boolean;
}
```

#### Example: Healthy

```
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "status": "ok",
  "version": "0.1.0",
  "models_available": ["efficientnet-image", "xception-face", "wav2vec-audio"]
}
```

#### Example: Degraded (Some Models Unavailable)

```json
{
  "status": "degraded",
  "version": "0.1.0",
  "models_available": ["efficientnet-image"]
}
```

#### Example: Down

```
HTTP/1.1 503 Service Unavailable
Content-Type: application/json
```

```json
{
  "status": "down",
  "version": "0.1.0",
  "models_available": []
}
```

#### Error Responses

| Status | Condition | Example Body |
|--------|-----------|-------------|
| `503` | Backend completely unreachable | Connection refused (no JSON body — handle at fetch level) |

---

### 8.4 POST /api/v1/detect-url

> [!WARNING]
> **Tier-2 endpoint, off by default.** Enabled only when the backend sets `FEATURE_DETECT_URL=true`; otherwise it returns `501 NOT_IMPLEMENTED`. The extension calls it only when the user turned on "Server fallback" in Options. Reddit often blocks datacenter IPs, so expect `REDDIT_BLOCKED` in some deployments.

The backend downloads the post's video with `yt-dlp` (<=480p, size cap 50 MB, duration cap 180 s, 90 s hard timeout), runs the same duration check as an upload, then analyses it exactly like `/detect`. Temp files are always deleted.

#### Request

```
POST /api/v1/detect-url HTTP/1.1
Host: localhost:8000
Content-Type: application/json
```

```json
{
  "url": "https://www.reddit.com/r/example/comments/abc123/some_title/",
  "media_type": "video"
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | `string` (URL) | ✅ Yes | A reddit.com post permalink: `https://(www.|old.|sh.|np.)reddit.com/r/<sub>/comments/<id>[/slug]`. No other host, port, scheme or credentials (SSRF guard) |
| `media_type` | `enum` | ✅ Yes | Only `video` is supported |

#### Success Response

`202 Accepted` with `{ "job_id": "job-..." }`. Poll `GET /api/v1/jobs/{job_id}` as usual.

#### Error Responses

| Status | Condition | Example Body |
|--------|-----------|-------------|
| `400` | URL is not a reddit.com permalink, or `media_type` is not `video` | `{ "error": "Only reddit.com post links are accepted.", "code": "VALIDATION_ERROR" }` |
| `413` | Video too long or too large to download | `{ "error": "The video is too long or too large to download.", "code": "VIDEO_TOO_LONG" }` |
| `501` | Feature flag off | `{ "error": "detect-url is not enabled. ...", "code": "NOT_IMPLEMENTED" }` |
| `502` | Reddit blocked the download | `{ "error": "Reddit blocked server download.", "code": "REDDIT_BLOCKED" }` |
| `502` | Any other download failure | `{ "error": "The video could not be downloaded.", "code": "DOWNLOAD_FAILED" }` |
| `503` | `yt-dlp` or ffmpeg missing | `{ "error": "yt-dlp is not installed on the server.", "code": "RESOLVER_UNAVAILABLE" }` |
| `504` | Download exceeded its time limit | `{ "error": "Downloading the video took too long.", "code": "PROCESSING_TIMEOUT" }` |

---

## 9. Legacy Endpoints

The backend also exposes legacy (pre-v1) endpoints. These are **not used by the extension** but documented for reference:

| Endpoint | Method | Description | Status |
|----------|--------|-------------|--------|
| `/api/predict/image` | POST | Synchronous image prediction | ⚠️ Deprecated |
| `/api/predict/video` | POST | Synchronous video prediction | ⚠️ Deprecated |
| `/api/predict/audio` | POST | Synchronous audio prediction | ⚠️ Deprecated |
| `/api/health` | GET | Basic health check | ⚠️ Deprecated |

> [!CAUTION]
> Legacy endpoints are synchronous (blocking) and do not support the job-based workflow. Do **not** use them in the extension. They may be removed in a future backend version.

---

## 10. Zod Schemas

These Zod schemas should be implemented in `src/core/schemas.ts` and used to validate all API responses in the service worker.

```typescript
import { z } from "zod";

// --- Enums ---

export const MediaTypeEnum = z.enum(["image", "video", "audio"]);

export const JobStatusEnum = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const VerdictLabelEnum = z.enum([
  "likely_real",
  "likely_fake",
  "inconclusive",
]);

// --- Shared ---

export const ModelResultSchema = z.object({
  score: z.number().min(0).max(1),
  label: z.string(),
  confidence: z.number().min(0).max(1),
});

export const ErrorResponseSchema = z.object({
  error: z.string(),
  detail: z.string().optional(),
  code: z.string().optional(),
});

// --- POST /api/v1/detect ---

export const DetectResponseSchema = z.object({
  job_id: z.string().uuid(),
});

// --- GET /api/v1/jobs/{job_id} ---

export const JobResponseSchema = z.object({
  status: JobStatusEnum,
  overall_score: z.number().min(0).max(1).optional(),
  label: VerdictLabelEnum.optional(),
  models: z
    .object({
      image: ModelResultSchema.optional(),
      face: ModelResultSchema.optional(),
      audio: ModelResultSchema.optional(),
    })
    .optional(),
  model_versions: z.record(z.string(), z.string()).optional(),
  error: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// --- GET /api/v1/health ---

export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  version: z.string(),
  models_available: z.array(z.string()),
  mock: z.boolean().optional(),
});

// --- POST /api/v1/detect-url ---

export const DetectUrlRequestSchema = z.object({
  url: z.string().url(),
  media_type: MediaTypeEnum,
});

export const DetectUrlResponseSchema = DetectResponseSchema;
// Same shape: { job_id: string }
```

---

## 11. Polling Strategy

The extension's service worker polls `GET /api/v1/jobs/{job_id}` with exponential backoff:

```
Attempt  Delay     Cumulative
1        1s        1s
2        2s        3s
3        4s        7s
4        8s        15s
5        16s       31s
6+       30s       61s, 91s, 121s, ...
```

### Algorithm

```typescript
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;
const BACKOFF_FACTOR = 2;
const MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 minutes

async function pollJob(jobId: string): Promise<JobResponse> {
  let delay = INITIAL_DELAY_MS;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
    const response = await fetch(`${API_BASE}/api/v1/jobs/${jobId}`);
    const job = JobResponseSchema.parse(await response.json());

    if (job.status === "completed" || job.status === "failed") {
      return job;
    }

    await sleep(delay);
    delay = Math.min(delay * BACKOFF_FACTOR, MAX_DELAY_MS);
  }

  throw new Error(`Job ${jobId} timed out after 5 minutes`);
}
```

### Checkpointing

On every poll cycle, the service worker writes the current job state to `chrome.storage.session`:

```typescript
await chrome.storage.session.set({
  [`job:${jobId}`]: {
    jobId,
    postId,
    status: job.status,
    lastPollAt: Date.now(),
    delay, // current backoff delay
  },
});
```

On SW restart, pending jobs are read from session storage and polling resumes with the saved delay value.


---

## 12. Contract Testing & Schema Parity (Pydantic ↔ Zod)

To prevent drift between the backend Python API and the extension TypeScript client, the contracts are mirrored 1:1 between Pydantic models in `moody_lens_ext.media` and Zod schemas in `reddit_extension/frontend/src/core/schema.ts`.

### Parity Mapping

| Concept | Pydantic Model (`reddit_extension/backend/moody_lens_ext/media.py`) | Zod Schema (`src/core/schema.ts`) |
|---------|----------------------------------------|-----------------------------------|
| Single Model Result | `ModelResult` | `ModelResultSchema` |
| Job Models Map | `JobModels` | `z.object({ image, face, audio })` |
| Job Status String | `JobStatusType` (`pending`, `processing`, `completed`, `failed`) | `JobStatusEnum` |
| Verdict Label String | `VerdictLabelType` (`likely_real`, `likely_fake`, `inconclusive`) | `z.enum(['likely_real', 'likely_fake', 'inconclusive'])` |
| Full Job Payload | `DetectionJob` | `DetectionJobSchema` |
| Detection Submission | `DetectResponse` (`job_id`) | `DetectResponseSchema` |
| Health Status | `HealthResponse` (`status`, `version`, `models_available`, optional `mock`) | `HealthResponseSchema` |
| Error Body | `ApiError` (`error`, `detail`, `code`) | `ApiErrorSchema` |

### Verification Harness

1. **Python Unit & Contract Tests** (`reddit_extension/backend/tests/test_media_api.py`):
   - Validates that real responses produced by `/api/v1/detect`, `/api/v1/jobs/{id}`, and `/api/v1/health` conform to Pydantic models.
   - Ensures detectors that did not run (such as `audio` on an image upload) evaluate to `null` / omitted rather than fallback or synthetic scores.
   - Tests JSON Schema serialization via `.model_json_schema()`.

2. **TypeScript Unit Tests** (`reddit_extension/frontend/tests/unit/schema.test.ts`):
   - Validates that fixture payloads matching the Pydantic schemas parse cleanly via `DetectionJobSchema.parse(...)` and `HealthResponseSchema.parse(...)`.
   - Verifies invalid states and status codes are rejected.

3. **Mock Backend** (`reddit_extension/frontend/tests/mock-server/index.mjs`):
   - Satisfies the same JSON contract, allowing end-to-end integration testing even in environments without PyTorch or Celery workers.
