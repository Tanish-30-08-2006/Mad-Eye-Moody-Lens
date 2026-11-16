# Moody Lens – Reddit Extension Project

This directory contains the Moody Lens Reddit Chrome extension and its companion backend integration module.

## Directory Layout

```
reddit_extension/
├── README.md                  # This file: layout, quickstart, and integration docs
├── frontend/                  # Chrome Extension (Manifest V3, WXT, React 19, TypeScript)
│   ├── README.md              # Frontend architecture and developer guide
│   ├── package.json           # Node scripts and dependencies
│   ├── pnpm-lock.yaml         # Pinned dependency lockfile
│   ├── wxt.config.ts          # WXT & extension manifest configuration
│   ├── vitest.config.ts       # Vitest unit test runner config
│   ├── playwright.config.ts   # Playwright E2E smoke test config
│   ├── public/icons/          # Extension icon assets
│   ├── src/                   # Extension source code
│   │   ├── entrypoints/       # Background service worker, content scripts, popup, options
│   │   ├── adapters/          # SiteAdapter: Reddit observer, extractors, SPA navigation
│   │   ├── background/        # Scan queue, rendition picker, media fetcher, job poller, handlers
│   │   ├── content/           # Content-script controller (lens buttons + shared popover glue)
│   │   ├── core/              # API client, cache, consent, settings, messaging, Zod schemas
│   │   └── ui/                # Lens button, shared popover, gauge, breakdown, styles
│   ├── tests/                 # Unit, contract parity, and E2E test suites
│   └── docs/                  # API contracts, architecture, and DOM recon
└── backend/                   # Extension Backend Integration
    ├── README.md              # Backend layout and runner documentation
    ├── pytest.ini             # Pytest configuration with dual pythonpath
    ├── run_dev.ps1            # Windows PowerShell dev server launcher
    ├── run_dev.sh             # Unix/macOS Bash dev server launcher
    ├── moody_lens_ext/        # Extension API endpoints and services
    │   ├── __init__.py
    │   ├── media.py           # V1 endpoints (/api/v1/detect, /jobs, /health, /detect-url)
    │   └── services/
    │       ├── __init__.py
    │       ├── url_resolver.py   # Tier-2 yt-dlp download (flag FEATURE_DETECT_URL, default off)
    │       └── video_prep.py     # ffprobe/ffmpeg: probe, duration cap, mux video + audio
    └── tests/
        ├── conftest.py            # Host fixtures (skipped when the host backend is absent)
        ├── test_media_api.py      # Host contract tests (need functional-ui-models-backend)
        ├── test_media_glue.py     # Wiring tests against a fake host
        ├── test_video_prep.py     # Real ffmpeg (skipped if absent)
        └── test_url_resolver.py   # SSRF and error mapping
```

---

## Getting Started

### Reddit verification workflows

**Original post.** Open the Lens on an explicit repost. The post's own title and flair stay separate from the linked original and any known intermediate repost. A title change is called out. An inaccessible or partial original can still have a usable link. The browser worker reads the existing Reddit post listing and follows its structured parent data, capped at four links; a link pasted into a post is not parent evidence. Metadata is cached in memory for five minutes (up to 96 posts). Reddit can withhold listings or parent fields, especially when signed out or when a community is private. Flair is displayed as observed post flair because it does not identify who applied it.

**Possible earlier match.** Open the Lens on an image in one Reddit post, then on the same bytes in another post. The worker checks SHA-256 in the browser, independent of the model and verdict cache. It records only the canonical post link, fingerprint and first observation time in extension-local storage (up to 300 observations, expiring on access after 30 days; Clear Cache removes them). It chooses the earliest strictly prior observation, excludes the current post, and never transfers flair. Resized, cropped or recompressed screenshots may need the existing **Find source** links: this workflow is exact image matching only, including when optional server perceptual hashing is absent. It does not establish authorship or the first upload, and never claims image matching for audio or video.

Source design: Reddit's [reposting help](https://support.reddithelp.com/hc/en-us/articles/4835584113684-What-is-reposting-fka-crossposting) describes the original preview, [private community help](https://support.reddithelp.com/hc/en-us/articles/360060416112-What-are-public-restricted-private-and-premium-only-communities) describes visibility limits, and [post flair help](https://support.reddithelp.com/hc/en-us/articles/15484545678996-Post-Flair) describes community control of flair. The Reddit adapter owns observed attributes; its observer disposes recycled cards, the content controller rejects stale work, and the worker owns read-only retrieval and matching. See the [API contract](frontend/docs/API-CONTRACT.md) for the model boundary.

**Copy with context.** Open the section in the Lens, or use the button next to a recognized native post Share control. Preview and copy the plain text, or copy just the canonical permalink. An explicit title tag such as [AI-generated] travels as the author's title label with the linked post; a flair travels separately as post flair. Only real, current, directly scoped scan results can supply a cautious finding. A rejected clipboard write leaves selectable text. To repost, copy before opening Reddit's composer, then paste where desired. Nothing is inserted into or overwrites a Reddit draft. [Reddit's Share help](https://support.reddithelp.com/hc/en-us/articles/53602138490388-How-do-I-share-Reddit-content-off-Reddit) describes its separate native menu; [Chrome's permission list](https://developer.chrome.com/docs/extensions/reference/permissions-list) documents the optional clipboard permission. The extension writes only on a click, with a manual fallback, and adds no clipboard permission.

### 1. Frontend Extension (`reddit_extension/frontend`)

```bash
cd reddit_extension/frontend

# Install dependencies with frozen lockfile
pnpm install --frozen-lockfile

# Typecheck and lint
pnpm typecheck
pnpm lint

# Run unit and contract tests (188 tests)
pnpm test

# Build for Chrome MV3 (.output/chrome-mv3)
pnpm build

# Optional: smoke test in real Chrome on a synthetic Reddit page (needs the build;
# set CHROME_PATH to a Chrome that can load unpacked extensions, e.g. Chrome for Testing)
pnpm test:e2e
```

**Loading into Chrome**:
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in upper right).
3. Click **Load unpacked** and select `reddit_extension/frontend/.output/chrome-mv3`.
4. Open the extension's **Options** and set the backend URL (default `http://localhost:8000`). For demo data without the real backend run `pnpm mock-server`.
5. On first scan the extension asks for consent to upload media to that backend. See `frontend/docs/MANUAL-TEST.md` for what to verify on real Reddit.

### 2. Backend Extension (`reddit_extension/backend`)

The extension backend integrates with the host application in `functional-ui-models-backend/backend`.

#### Running the Development Server

From `reddit_extension/backend`:
- **Windows (PowerShell)**:
  ```powershell
  .\run_dev.ps1
  ```
- **Linux / macOS**:
  ```bash
  chmod +x run_dev.sh
  ./run_dev.sh
  ```

Video features need **ffmpeg and ffprobe** on the server's PATH. Without them a video that comes with a separate audio track is answered with `503 FFMPEG_UNAVAILABLE`. The optional Tier-2 fallback (`FEATURE_DETECT_URL=true`) also needs `pip install yt-dlp`.

Both launchers set `PYTHONPATH` to include `reddit_extension/backend` and execute `uvicorn app.main:app --reload --reload-dir app --port 8000` from within the host backend directory.

#### Running Backend Tests

```bash
cd reddit_extension/backend
pytest tests -v
```

Or from the repository root:
```bash
pytest reddit_extension/backend/tests -v
```

Tests that need the host backend (`app.*`) skip themselves when it is not importable.

---

## Docker Caveat

> [!WARNING]
> The host Dockerfile (`functional-ui-models-backend/Dockerfile`) builds strictly from `functional-ui-models-backend/backend/` and does **not** include `reddit_extension/backend/` on its `PYTHONPATH`. 
> 
> When running inside existing Docker containers, the host backend gracefully logs `reddit_extension_router_unavailable` via the guarded import in `app/main.py`. Packaging extension endpoints into the production container requires a Dockerfile / build configuration change that must be approved by the repository owner (not included in this repository reorganization).
