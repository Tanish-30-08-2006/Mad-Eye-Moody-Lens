# Moody Lens — Architecture

> **Version:** 0.1.0-draft · **Last updated:** 2026-11-02  
> **Branch:** `darshan-dev`

---

## 1. Project Overview

**Moody Lens** is a Manifest V3 Chrome extension that adds inline deepfake-detection capabilities to Reddit. When browsing Reddit, a small "Moody Lens" scan button is injected beside every media post. Clicking it sends the post's media to a local analysis backend, which returns a verdict (likely real / likely fake / inconclusive) displayed in a popover.

### Goals

| # | Goal | Measure |
|---|------|---------|
| G1 | Non-intrusive deepfake scanning on Reddit | Button does not interfere with native Reddit UX |
| G2 | Support image, video, and audio media | All three media types produce a verdict |
| G3 | Privacy-first, local-only analysis | All traffic stays on `localhost:8000` (v1) |
| G4 | Resilient to Reddit DOM changes | SiteAdapter pattern + Phase-0 fixture tests |
| G5 | MV3-compliant architecture | No `eval`, no remote code, SW-only network |

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER (Chrome)                     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Reddit Tab (Content Script)              │   │
│  │                                                       │   │
│  │  ┌─────────────┐    ┌──────────────────────────────┐ │   │
│  │  │ SiteAdapter  │    │   Shadow Root UI             │ │   │
│  │  │  (Reddit)    │    │  ┌────────┐  ┌───────────┐  │ │   │
│  │  │              │───▶│  │ Button  │  │  Popover  │  │ │   │
│  │  │ • Extractor  │    │  │(per post│  │ (shared,  │  │ │   │
│  │  │ • Observer   │    │  │ shadow) │  │  1 inst.) │  │ │   │
│  │  │ • Injector   │    │  └────────┘  └───────────┘  │ │   │
│  │  └──────────────┘    └──────────────────────────────┘ │   │
│  └────────────────────────────┬──────────────────────────┘   │
│                               │ chrome.runtime.sendMessage   │
│                               │ (typed messages)             │
│                               ▼                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            Service Worker (Background)                │   │
│  │                                                       │   │
│  │  • Message router (core/messaging.ts)                 │   │
│  │  • Media fetcher (browser session cookies)            │   │
│  │  • Backend API client                                 │   │
│  │  • Job poller                                         │   │
│  │  • Keepalive via open port                            │   │
│  │  • State in chrome.storage.session                    │   │
│  └────────────────────────────┬──────────────────────────┘   │
│                               │ fetch() to localhost         │
└───────────────────────────────┼──────────────────────────────┘
                                ▼
                 ┌──────────────────────────┐
                 │   FastAPI Backend        │
                 │   localhost:8000         │
                 │                          │
                 │  POST /api/v1/detect     │
                 │  GET  /api/v1/jobs/{id}  │
                 │  GET  /api/v1/health     │
                 │  POST /api/v1/detect-url │
                 └──────────────────────────┘
```

---

## 3. Component Breakdown

### 3.1 Content Script (`src/entrypoints/reddit.content/`)

The content script runs on `www.reddit.com` and `sh.reddit.com`. Its responsibilities:

- **Detect posts** — The adapter's observer reports each `<shreddit-post>` once, when it is on screen (`MutationObserver` for added nodes, then `IntersectionObserver`).
- **Extract media metadata** — Delegates to the Reddit SiteAdapter to pull media URLs, post IDs, and media types from post elements.
- **Inject UI** — Mounts one lens button per media post (text/link posts get none) in its own shadow root via WXT `createShadowRootUi`, and ONE shared popover on `<body>`.
- **Communicate** — `content/controller.ts` sends typed, validated messages to the service worker and tracks per-post state (idle, scanning, done, error). Auto-scan, when enabled, uses the same messages with `origin: 'auto'`.
- **Display results** — The shared popover shows loading, verdict, error with Retry, or the consent prompt; it also renders results pushed by the service worker after an image context-menu scan.
- **Clean up** — On SPA navigation the adapter stops, removes every lens and marker, and restarts; on extension update everything is unmounted.

### 3.2 Service Worker (`src/background/`)

The MV3 service worker acts as the network and orchestration layer:

- **Message handling** (`handlers/`) — Listens for typed messages from content scripts and routes them to appropriate handlers.
- **Media fetching** — Uses `fetch()` with the browser's session cookies to download media from Reddit CDN (i.redd.it, v.redd.it, etc.). This must happen in the SW because content scripts on Reddit cannot make cross-origin requests to all CDN domains.
- **Consent gate** — Refuses every scan with `CONSENT_REQUIRED` until the user accepts (stored in `chrome.storage.local`).
- **Scan queue** (`scan-queue.ts`) — At most 2 scans run at once; identical in-flight scans (same cache key) share one run; automatic scans are capped per minute. Lens clicks, auto-scan and the context menu all use it.
- **Video** — `rendition.ts` picks a progressive MP4 (tallest up to 480p, falling back on size); the audio track is fetched separately and uploaded as the `audio` part. HLS/DASH-only videos report "Video format not supported yet" unless the server fallback is enabled.
- **Friendly errors** (`errors.ts`) — Every typed failure maps to a stable code and a message with no URLs or internals.
- **Backend communication** — Uploads media to the FastAPI backend via `POST /api/v1/detect`, then polls `GET /api/v1/jobs/{id}` until the job completes.
- **Keepalive** — Maintains an open `chrome.runtime.connect` port to prevent the SW from being killed mid-job (see §5).
- **State persistence** — Stores in-flight job state in `chrome.storage.session` so jobs can survive a SW restart.

### 3.3 Adapters (`src/adapters/`)

Adapters encapsulate all site-specific logic behind a common `SiteAdapter` interface:

```typescript
interface SiteAdapter {
  findPosts(): HTMLElement[];
  isMediaPost(post: HTMLElement): boolean;          // image / gallery / video by post-type
  extractMedia(post: HTMLElement): MediaRef | null; // null for text, link, removed, no media
  getMountPoint(post: HTMLElement): MountPoint | null;
  describe(post: HTMLElement): unknown;             // Debug-only selector dump
  observe(onPost: PostCallback, onNavigate?: () => void): void; // once per visible post
  disconnect(): void;                               // idempotent; removes everything added
}
```

Currently, only a **Reddit adapter** (`src/adapters/reddit/`) is implemented.

#### Reddit Adapter Internals

| Sub-module | Responsibility |
|------------|---------------|
| `selectors.ts` | Every Reddit selector and attribute name. Only `post-type`, `content-href`, `permalink`, `id`, `post-title` are verified; the rest are marked `// UNVERIFIED: confirm in DevTools` |
| `extract-image.ts`, `extract-gallery.ts`, `extract-video.ts` (+ `extract-common.ts`) | Pure functions: post element to `MediaRef` or null. `content-href` first, then guarded fallbacks (`<img>` srcset/lazy attributes, player attributes, media-JSON attributes, `<video>`/`<source>`). Every URL must be https on the media allowlist |
| `observer.ts` | `MutationObserver` (added nodes only, 300 ms debounce) feeding an `IntersectionObserver`; `WeakSet` plus a `data-moody-lens` marker for dedupe; `stop()` removes markers and runs per-post disposers |
| `spa-navigation.ts` | Navigation API `navigatesuccess` plus a debounced `location.href` comparison fallback; history is never patched |
| `debug.ts` | With Debug on, a lens click logs the post's attribute names, candidate URLs and the extraction result |
| `index.ts` | Implements `SiteAdapter`; on navigation stops, clears and restarts; warns once if a feed page shows no `<shreddit-post>` after 10 s (markup-drift canary) |

### 3.4 Core (`src/core/`)

Shared utilities and contracts used by both the content script and the service worker:

| Module | Purpose |
|--------|---------|
| `messaging.ts` | Typed message definitions (discriminated union) and helper functions for `chrome.runtime.sendMessage` / `onMessage` |
| `types.ts` | Shared TypeScript types: `MediaInfo`, `Verdict`, `JobStatus`, `DetectRequest`, etc. |
| `constants.ts` | Magic strings, timeouts, size limits, API base URL |
| `schemas.ts` | Zod schemas for API request/response validation |

### 3.5 UI (`src/ui/`)

React components rendered inside shadow roots:

| Component | Description |
|-----------|-------------|
| `lens-button.ts` | Vanilla (no React per post) button: idle / scanning / done (verdict chip, `DEMO` when mock) / error. Keyboard accessible; swallows its own click and keys so Reddit never sees them |
| `VerdictPopover.tsx`, `popover-host.tsx` | The single shared React popover: spinner, verdict + gauge + per-model rows ("not run" for null models, DEMO DATA badge when mock), error with Retry, consent prompt. Positioned when opened; closes on Esc, outside click or navigation |
| `Gauge.tsx`, `ModelBreakdown.tsx`, `Spinner.tsx`, `position.ts`, `styles.css` | Parts and plain CSS (light and dark via `prefers-color-scheme`) |

### 3.6 Other Entrypoints

| Entrypoint | Path | Purpose |
|------------|------|---------|
| Popup | `src/entrypoints/popup/` | Toolbar popup — backend health (with a DEMO DATA flag for mock backends), consent state, what the active Reddit tab found, link to options |
| Options | `src/entrypoints/options/` | Settings — backend URL (http/https, validated; Chrome asks for access to a custom origin), auto-scan (default off), server fallback (default off), Debug, Clear cache, consent |

---

## 4. Data Flow

The end-to-end flow from user click to verdict display:

```
User clicks Lens button on a Reddit post
         │
         ▼
┌─────────────────────────────────────────┐
│ 1. Content Script: extractMedia(post)   │
│    → { url, mediaType, postId }         │
└─────────────────┬───────────────────────┘
                  │ chrome.runtime.sendMessage
                  │ { type: "SCAN_REQUEST", payload }
                  ▼
┌─────────────────────────────────────────┐
│ 2. Service Worker: handleScanRequest()  │
│    a. fetch(mediaUrl) with session      │
│       cookies → Blob                    │
│    b. Build FormData (media, metadata)  │
│    c. POST /api/v1/detect → 202        │
│       { job_id }                        │
│    d. Store job in chrome.storage       │
│       .session                          │
└─────────────────┬───────────────────────┘
                  │ Poll loop
                  ▼
┌─────────────────────────────────────────┐
│ 3. Service Worker: pollJob(jobId)       │
│    GET /api/v1/jobs/{job_id}            │
│    Loop until status ∈                  │
│      { completed, failed }              │
│    Backoff: 1s → 2s → 4s (max 30s)     │
└─────────────────┬───────────────────────┘
                  │ chrome.runtime.sendMessage
                  │ (or port.postMessage)
                  │ { type: "SCAN_RESULT", verdict }
                  ▼
┌─────────────────────────────────────────┐
│ 4. Content Script: showVerdict()        │
│    Position popover at button           │
│    Render verdict in React popover      │
└─────────────────────────────────────────┘
```

### Media Fetch Strategy (Tiered)

| Tier | Method | When |
|------|--------|------|
| **Tier 1 (Primary)** | Service worker `fetch()` with browser session | Always attempted first. Hosts: i.redd.it, preview.redd.it, external-preview.redd.it, v.redd.it (https only) |
| **Tier 2 (Fallback)** | `POST /api/v1/detect-url` — backend uses `yt-dlp` | Off unless the user enables "Server fallback" in Options AND the backend sets `FEATURE_DETECT_URL`. Used for HLS/DASH-only videos or when the browser fetch fails. Reddit may block datacenter IPs |

---

## 5. MV3 Constraints & Mitigations

Manifest V3 introduces significant constraints compared to MV2. Here is how Moody Lens handles each:

### 5.1 No Persistent Background Page

**Constraint:** The service worker can be terminated at any time after ~30 seconds of inactivity.

**Mitigation:**
- **Keepalive port:** The content script opens a `chrome.runtime.connect` port when a scan is in progress. An open port prevents the SW from being killed.
- **Session storage checkpointing:** In-flight job state (`{ jobId, postId, status }`) is written to `chrome.storage.session` on every poll cycle. If the SW is killed and restarted, it reads pending jobs from session storage and resumes polling.
- **Idempotent operations:** The backend's job-based API means the SW can safely re-poll a job without side effects.

### 5.2 Cross-Origin Requests Only in Service Worker

**Constraint:** Content scripts are subject to the page's CSP and CORS policies. Reddit's CSP blocks many cross-origin fetches.

**Mitigation:** All network requests (media download, backend API calls) are made from the service worker, which has its own origin (`chrome-extension://...`) and can declare `host_permissions` in the manifest.

### 5.3 No `eval()` or Remote Code

**Constraint:** MV3 forbids `eval()`, `new Function()`, and remotely-hosted code.

**Mitigation:** All code is bundled at build time via Vite/WXT. No dynamic code evaluation. Zod schemas handle runtime validation without `eval`.

### 5.4 Service Worker Startup Latency

**Constraint:** The SW may take 50–200 ms to spin up on first message.

**Mitigation:** The UI shows a "connecting…" state immediately on button click. The content script retries the message once if it gets no response within 500 ms.

---

## 6. SiteAdapter Pattern

The SiteAdapter pattern decouples site-specific DOM logic from the extension core:

```
┌───────────────────────────────┐
│        Core Extension         │
│  (messaging, UI, SW logic)    │
│                               │
│  Uses SiteAdapter interface   │
│  for all DOM interactions     │
└───────────────┬───────────────┘
                │ implements
    ┌───────────┴───────────┐
    │                       │
┌───┴──────────┐   ┌───────┴──────┐
│ RedditAdapter│   │ FutureAdapter│
│              │   │ (Twitter,    │
│ • extractor  │   │  YouTube…)   │
│ • observer   │   │              │
│ • injector   │   │              │
└──────────────┘   └──────────────┘
```

**Benefits:**
1. **Testability** — Adapter extractors are pure functions tested against saved HTML fixtures (no live Reddit needed).
2. **Isolation** — Reddit DOM changes only affect `src/adapters/reddit/`; the rest of the codebase is untouched.
3. **Extensibility** — Adding support for Twitter/X, YouTube, or other platforms means adding a new adapter without modifying core logic.
4. **Selector drift resilience** — If Reddit renames a class or restructures HTML, the fix is localized to the adapter, and Phase-0 fixture tests catch the regression.

---

## 7. Shadow Root UI Strategy

### One Button per Post

Each media `<shreddit-post>` gets its own lens button, rendered inside an **open shadow root** (WXT `createShadowRootUi`, `cssInjectionMode: 'ui'`) whose host sits at the top-right of the post's media container. The host ignores pointer events except on the button. This ensures:

- Reddit's CSS does not style or break our button.
- Our button's CSS does not leak into Reddit's page.
- Each button has independent state (idle, scanning, done, error).

### One Shared Popover

Rather than creating a popover per post (which would mean hundreds of React roots on a long feed), a **single popover component** is rendered once and repositioned to whichever button was last clicked.

```
<body>
  ...
  <shreddit-post>                       ← Reddit's post #1
    <div id="moody-lens-host-abc123">
      #shadow-root (closed)
        <button class="lens-btn">🔍</button>
    </div>
  </shreddit-post>

  <shreddit-post>                       ← Reddit's post #2
    <div id="moody-lens-host-def456">
      #shadow-root (closed)
        <button class="lens-btn">🔍</button>
    </div>
  </shreddit-post>

  ...
  <div id="moody-lens-popover-root">    ← Shared popover container
    #shadow-root (closed)
      <div class="verdict-popover">
        <!-- anchored to active button -->
      </div>
  </div>
</body>
```

**Positioning:** The popover uses `position: fixed` and computes its coordinates once, when opened, from the active button's `getBoundingClientRect()` (`ui/position.ts`, kept inside the viewport). It does not follow scrolling: it closes on Esc, an outside click or navigation.

---

## 8. Tech Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Extension framework | [WXT](https://wxt.dev) | 0.21.5 |
| UI library | React | 19.3.1 |
| Language | TypeScript | 7.0.2 |
| Bundler | Vite | 8.3.5 |
| Test runner | Vitest | 5.0.5 |
| Schema validation | Zod | 4.6.7 |
| Package manager | pnpm | latest |
| Backend (separate branch) | FastAPI (Python) | — |
| E2E (manual) | Playwright | — |
| Mock server | Express (Node.js) | — |

---

## 9. Directory Structure

```
reddit_extension/frontend/
├── docs/                          # Project documentation
│   ├── ARCHITECTURE.md            # This file
│   ├── DOM-RECON.md               # Reddit DOM reconnaissance template
│   ├── API-CONTRACT.md            # Backend API contract
│   └── TEST-PLAN.md               # Testing strategy per phase
│
├── public/
│   └── icons/                     # Extension icons (16, 32, 48, 128)
│
├── scripts/                       # Dev/build helper scripts
│   └── record-fixture.mjs         # Saves Reddit HTML snapshots for tests
│
├── src/
│   ├── adapters/                  # Site-specific adapters
│   │   └── reddit/                # Reddit adapter
│   │       ├── extractor.ts       # Media URL + metadata extraction
│   │       ├── observer.ts        # MutationObserver + IntersectionObserver
│   │       └── injector.ts        # Button injection logic
│   │
│   ├── background/                # Service worker entrypoint + logic
│   │   └── handlers/              # Message handlers (scan, health, etc.)
│   │
│   ├── core/                      # Shared code (CS ↔ SW)
│   │   ├── messaging.ts           # Typed message protocol
│   │   ├── types.ts               # Shared type definitions
│   │   ├── constants.ts           # Config values, limits, URLs
│   │   └── schemas.ts             # Zod schemas for API validation
│   │
│   ├── entrypoints/               # WXT entrypoints
│   │   ├── reddit.content/        # Content script for Reddit
│   │   ├── popup/                 # Toolbar popup
│   │   └── options/               # Options page
│   │
│   └── ui/                        # React components
│       ├── LensButton.tsx         # Per-post scan button
│       ├── VerdictPopover.tsx     # Shared verdict display
│       └── ConsentBanner.tsx      # First-run consent (Phase 7)
│
└── tests/
    ├── unit/                      # Vitest unit tests
    ├── e2e/                       # Playwright E2E tests (manual)
    ├── fixtures/
    │   └── reddit/                # Saved HTML fixture files
    └── mock-server/               # Express-based mock backend
```

---

## 10. Assumptions

| ID | Assumption | Impact if Wrong |
|----|-----------|-----------------|
| **A1** | `backend/` directory does not exist on `darshan-dev`; all extension files are purely additive | Merge conflicts if backend code exists on this branch |
| **A2** | WXT 0.21.5 with Vite 8 works (WXT peer dependencies allow `^8`) | Build may fail; would need to pin Vite to 7.x or wait for WXT update |
| **A3** | `<shreddit-post>` tag name and attributes (`post-type`, `content-href`, `permalink`, `id`, `post-title`) are stable; all other DOM details **VERIFY IN PHASE 0** | Extraction logic breaks; adapter needs update |
| **A4** | Mock server uses Express (Node.js) for local dev/test | If team prefers another tool, mock-server setup changes |

---

## 11. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| **R1** | WXT 0.21.5 may have API differences from older tutorials and examples | Medium | Medium | Pin version, read WXT changelog, test scaffold early (Phase 1) |
| **R2** | TypeScript 7.0.2 is very new; possible package compatibility issues with type declarations | Medium | High | Keep `skipLibCheck: true` as escape hatch; file issues upstream |
| **R3** | Reddit DOM may change without notice (class renames, tag restructuring, shadow root additions) | High | High | Phase-0 fixture snapshots, Playwright selector canary, adapter isolation pattern |

---

## 12. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| Q1 | Does `<shreddit-post>` use a shadow root internally? If so, can we pierce it? | Phase 0 recon | ❓ Open |
| Q2 | How does Reddit's video player load HLS segments — directly in `<video>` or via a JS player? | Phase 0 recon | ❓ Open |
| Q3 | Should the popover use `popover` API (Popover API) or stick with manual positioning? | Design decision | ❓ Open |
| Q4 | Is `chrome.storage.session` sufficient for job state, or do we need `chrome.storage.local` for persistence across browser restarts? | Architecture | ❓ Open |
| Q5 | Rate limiting strategy for the local backend — needed at all for v1? | Backend team | ❓ Open |
| Q6 | How to handle gallery posts with 20+ images — scan all or only visible? | UX decision | ✅ v1 scans the first image only (one `media` upload per scan) |
| Q7 | Should Tier-2 (`detect-url`) be behind a user-facing setting or just an internal feature flag? | Product decision | ✅ Both: Options toggle (default off) and the backend `FEATURE_DETECT_URL` flag |
