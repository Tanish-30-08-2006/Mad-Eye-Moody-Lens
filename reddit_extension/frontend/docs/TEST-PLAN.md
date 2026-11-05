# Moody Lens – Test Plan (Phases 0–7)

> **Version:** 1.0.0  
> **Last updated:** 2026-11-02  
> **Branch:** `darshan-dev`

This document defines the test plan and acceptance criteria across all development phases (Phases 0 through 7) for the Moody Lens Reddit extension and its integration with the backend.

---

## Phase 0: Recon & Contracts

### Scope
- Establish DOM templates, architecture design, API contract specifications, and test fixtures recorder.
- No production extension or detection code.

### Test Matrix
| ID | Target / Spec | Test Description | Success Criteria |
|---|---|---|---|
| T0.1 | `docs/DOM-RECON.md` | Template completeness | All post types (image, gallery, video with audio, silent video/GIF, crosspost, text, link, removed, NSFW) have designated capture sections. |
| T0.2 | `docs/API-CONTRACT.md` | Schema alignment | Endpoints (`/api/v1/detect`, `/api/v1/jobs/{id}`, `/api/v1/health`, `/api/v1/detect-url`) match request/response models in design specifications. |
| T0.3 | `scripts/record-fixture.mjs` | Executable syntax | Script parses valid arguments, includes target post selectors, and runs without syntax errors under Node 22+. |
| T0.4 | `docs/ARCHITECTURE.md` | Design constraints | Documents MV3 architecture, SiteAdapter interface, shadow root UI injection, and assumptions/risks. |

---

## Phase 1: Scaffold & Tooling

### Scope
- Repository layout for `reddit_extension/frontend/`, build tooling (WXT + React 19 + TypeScript + pnpm), config files, typed stubs, and mock backend server.
- Additive backend stubs in `reddit_extension/backend/moody_lens_ext/media.py`, `reddit_extension/backend/moody_lens_ext/services/url_resolver.py`, `reddit_extension/backend/moody_lens_ext/services/video_prep.py`, and `reddit_extension/backend/tests/test_media_api.py`.

### Test Matrix
| ID | Target / Spec | Test Description | Success Criteria |
|---|---|---|---|
| T1.1 | Build & Bundle | `pnpm build` in `reddit_extension/frontend/` | Builds cleanly; output generated in `.output/chrome-mv3` with valid `manifest.json`. |
| T1.2 | Type Checking | `pnpm typecheck` (`tsc --noEmit`) | 0 TypeScript errors under strict mode. |
| T1.3 | Code Linting | `pnpm lint` (`eslint .`) | 0 ESLint errors. |
| T1.4 | Content Script Isolation | Content script match pattern | Content script matches `*://www.reddit.com/*` and `*://sh.reddit.com/*` only. Does not inject on non-Reddit URLs. |
| T1.5 | Messaging Ping-Pong | Typed SW messaging | Service worker listens for `PING` message from content script and responds with `{ type: 'PONG', timestamp: number }`. |
| T1.6 | Mock Backend Server | `tests/mock-server` | Implements `/api/v1/health`, `POST /api/v1/detect` (returns 202 `{ job_id }`), `GET /api/v1/jobs/:id` (returns status, scores, label). |
| T1.7 | Unit Tests Setup | `pnpm test` (`vitest run`) | Vitest executes test suite without harness failures. |
| T1.8 | CI Workflow | `.github/workflows/extension.yml` | GitHub Actions workflow validates checkout, pnpm setup, typecheck, lint, test, and build. |

---

## Phase 2: Backend Contract & Endpoints

### Scope
- Backend FastAPI implementation for `/api/v1/detect`, `/api/v1/jobs/{id}`, and `/api/v1/health`.
- Type/size validation, asynchronous job processing, and CORS configuration for extension origin.

### Test Matrix
| ID | Target / Spec | Test Description | Success Criteria |
|---|---|---|---|
| T2.1 | API Health Endpoint | `GET /api/v1/health` | Returns 200 with service health status and registered model list. |
| T2.2 | Valid Upload | `POST /api/v1/detect` (Image) | Valid image upload returns 202 Accepted with a unique `job_id`. |
| T2.3 | Job Polling | `GET /api/v1/jobs/{id}` | Returns job state progression (`pending` -> `processing` -> `completed`). |
| T2.4 | Oversized Payload | `POST /api/v1/detect` (>20MB image) | Returns HTTP 413 Payload Too Large with structured error payload. |
| T2.5 | Invalid MIME / Signature | File signature verification | Files with spoofed extensions fail magic-number verification with HTTP 415. |
| T2.6 | Schema Parity | Zod vs. Pydantic | Responses from real backend pass Zod runtime schema validation in the extension. |

---

## Phase 3: Service Worker & Resilience

### Scope
- Background service worker lifecycle: `media-fetcher`, `job-poller` with backoff, keepalive mechanism, and `chrome.storage.session` state storage.
- Chrome context menus for images.

### Test Matrix
| ID | Target / Spec | Test Description | Success Criteria |
|---|---|---|---|
| T3.1 | Host Allowlist | `media-fetcher` URL validation | Allows `i.redd.it`, `preview.redd.it`, `v.redd.it`; rejects external origins with explicit error. |
| T3.2 | Media Size Capping | Pre-fetch content-length check | Rejects media exceeding configured thresholds before downloading full payload. |
| T3.3 | Polling Backoff | `job-poller` retry scheduling | Polling frequency throttles gracefully (e.g., 1s -> 2s -> 4s) up to maximum timeout. |
| T3.4 | Worker Lifecycle Recovery | Service worker termination mid-job | Active jobs saved in `chrome.storage.session` resume polling when worker wakes up. |
| T3.5 | Backend Disconnection | Unreachable API handling | Surface clear error response to caller; transitions job to `failed` without crashing. |
| T3.6 | End-to-End Verdict | Full pipeline with test image | End-to-end against mock or real backend returns verdict for test image. |

### Phase 3 Manual Check Verification Protocol

1. **Worker Termination Mid-Job & Resumption**:
   - *Test Procedure*: Initiate a long-running video scan, kill the background service worker process via `chrome://serviceworker-internals`, wake the worker.
   - *Expected Result*: `restoreInFlightJobs()` reads active job records from `chrome.storage.session` and resumes polling without user re-intervention.
   - *Automated Parity*: Covered in Vitest `tests/unit/job-poller.test.ts` via session storage mocking and restore loop.

2. **Backend Stopped / Unreachable Error**:
   - *Test Procedure*: Shut down backend port 8000, trigger lens button click.
   - *Expected Result*: API client catches connection failure and maps cleanly to typed `ApiClientError(code: 'NETWORK_ERROR')`; UI displays clear error state without crashing.
   - *Automated Parity*: Covered in Vitest `tests/unit/api-client.test.ts`.

3. **Non-Allowlisted Host Refusal**:
   - *Test Procedure*: Dispatch `SCAN_MEDIA` with `https://imgur.com/sample.jpg` or `http://i.redd.it/insecure.jpg`.
   - *Expected Result*: Refused at media-fetcher boundary with `MediaFetchError(code: 'DISALLOWED_HOST')` before network request is issued.
   - *Automated Parity*: Covered in Vitest `tests/unit/media-fetcher.test.ts`.

---

## Phase 4: Reddit Adapter (DOM Extraction)

### Scope
- `SiteAdapter` implementation for Reddit: `MutationObserver` (debounced ~300ms), `IntersectionObserver`, deduplication (WeakSet + attribute marker), SPA navigation listener, and media extractors.

### Test Matrix
| ID | Target / Spec | Test Description | Success Criteria |
|---|---|---|---|
| T4.1 | Image Extraction | Happy-dom fixture tests | Accurately extracts full-res image URL, post ID, permalink from Phase 0 fixture. |
| T4.2 | Gallery Extraction | Happy-dom fixture tests | Extracts array of slide image URLs without omissions. |
| T4.3 | Video Extraction | Happy-dom fixture tests | Extracts video stream renditions and separate audio URL when present. |
| T4.4 | Debounced Mutation | Feed observer under rapid DOM updates | Batches DOM mutations (~300ms) and processes new `<shreddit-post>` nodes once. |
| T4.5 | Deduplication | Re-observing same posts | Posts stamped with `data-moody-lens` are never re-processed. |
| T4.6 | SPA Navigation | Route change detection | Navigation across subreddits or feed sorts triggers clean observer re-attachment. |

---

## Phase 5: UI Injection & Shadow DOM Isolation

### Scope
- In-feed "Moody Lens" button mounted in post shadow root.
- Shared React popover singleton for verdicts, loading spinner, score gauges, and model breakdown.

### Test Matrix
| ID | Target / Spec | Test Description | Success Criteria |
|---|---|---|---|
| T5.1 | CSS Encapsulation | Shadow root style isolation | Host page Reddit CSS does not bleed into button/popover; extension styles do not leak to feed. |
| T5.2 | Click Event Isolation | Lens button activation | Clicking the lens button triggers detection popover without triggering post link navigation. |
| T5.3 | Singleton Popover | Multiple button clicks | Only one popover root exists in DOM; switches target post coordinates dynamically. |
| T5.4 | Theme Adaptability | Dark / light mode styling | Lens UI dynamically adjusts to Reddit dark mode and light mode themes. |
| T5.5 | Infinite Scroll Perf | 200+ posts DOM stress test | Scrolling feed generates 0 duplicate buttons, 0 memory leaks, and no dropped animation frames. |

---

## Phase 6: Video End-to-End & Audio Muxing

### Scope
- Video acquisition: mid-quality video rendition (360p–480p) + separate DASH audio fetch.
- Backend video processing: ffmpeg keyframe extraction at fixed FPS, audio extraction, multimodal inference.
- Tier-2 fallback: `/api/v1/detect-url` behind feature flag.

### Test Matrix
| ID | Target / Spec | Test Description | Success Criteria |
|---|---|---|---|
| T6.1 | Video + Audio Post | Combined audio/video post | Downloads both tracks, uploads to backend, runs video and audio detectors, aggregates score. |
| T6.2 | Silent Video / GIF | Posts without audio track | Accurately detects absence of audio; marks audio modality as omitted/inapplicable. |
| T6.3 | Video Duration Limits | Short (<3s) and long (>5min) clips | Long videos capped to max duration; short videos handled gracefully without frame starvation. |
| T6.4 | Crossposts & Embeds | Nested/referenced video posts | Resolves target source post and extracts playable stream. |
| T6.5 | Tier-2 Fallback | Restricted/blocked client download | Falls back to server-side `detect-url` via yt-dlp if client-side fetch fails. |

---

## Phase 7: Hardening, Caching & Production Polish

### Scope
- Post/media hash result caching in `chrome.storage.local`.
- Concurrency limiting, user consent modal, auto-scan settings toggle.
- Production bundle optimization (`wxt zip`) and selector-drift mitigation.

### Test Matrix
| ID | Target / Spec | Test Description | Success Criteria |
|---|---|---|---|
| T7.1 | Result Cache Hit | Repeated scan of same post | Serves result instantly from cache without firing network request to backend. |
| T7.2 | Cache Expiry (TTL) | Expired entries | Items older than TTL (1 hour) are evicted; triggers fresh analysis. |
| T7.3 | Concurrency Throttle | Multiple concurrent scan requests | Limits parallel backend uploads to maximum concurrency limit (e.g. 2 concurrent). |
| T7.4 | User Consent Modal | First-run privacy notice | Extension prompts for user consent before transmitting any media payload to server. |
| T7.5 | Selector Drift Grace | Broken selector simulation | When `<shreddit-post>` markup changes, extension logs warning and fails silently without console crashes. |
| T7.6 | Packaged Archive | `wxt zip` release build | Generates compliant, store-ready ZIP bundle containing all compiled assets and manifest. |
