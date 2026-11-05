# PLAN.md: Moody Lens Reddit Extension (Phases 0-7)

Source of truth for scope, order and tests. Written Nov 2, 2026. Anything marked VERIFY must be confirmed in DevTools (Phase 0) and never guessed.

## 1. Corrections to the original blueprint

1. **Tag name.** Reddit posts are `<shreddit-post>`, not `<sh-post>`. Each sits in an `<article>` inside `<shreddit-feed>`. Known attributes: `post-type`, `content-href`, `permalink`, `id`, `post-title`. Search results use different markup (`data-testid="sdui-post-unit"`), so v1 covers feed, subreddit and post pages only.
2. **Manifest hosts.** The original `host_permissions` contained pasted markdown links. Use plain patterns:
   - `https://*.reddit.com/*`
   - `http://localhost:8000/*`
   - `https://i.redd.it/*`, `https://v.redd.it/*`, `https://preview.redd.it/*`
3. **Tooling.** Use WXT (built-in shadow-root UI helper, CSS injection into the shadow root, auto-cleanup on extension update). Fallback: `@crxjs/vite-plugin` 3.x with Vite pinned to `^7` (Vite 8 / Rolldown breaks CRXJS content-script builds with "Content script fileName is undefined").
4. **Video acquisition.** Server-side yt-dlp is unreliable for Reddit (HTTP 403 "Blocked", misleading "authentication required" message, worse from datacenter IPs).
   - **Primary path:** the extension service worker fetches media bytes using the user's own browser session and uploads them to the backend.
   - **Tier-2 fallback:** `/api/v1/detect-url` using yt-dlp (with impersonation), behind a feature flag.
   - Reddit video = video-only renditions plus a separate audio file (e.g. a fallback MP4 and `DASH_audio.mp4`). Naming varies (`DASH_*` vs `CMAF_*`), so read URLs from the page or manifest; never hardcode.
5. **MV3 constraints.**
   - Content scripts are bound by the page's CORS. All network calls go through the service worker (with `host_permissions`).
   - The service worker is killed after about 30 s idle, and a fetch slower than 30 s is killed. Keep it alive with an open port; persist job state in `chrome.storage.session`.
   - The backend returns a `job_id`; the extension polls `/jobs/{id}`.

## 2. Repo structure

```
reddit_extension/
  frontend/
    package.json  wxt.config.ts  tsconfig.json  eslint.config.js
    vitest.config.ts  playwright.config.ts  .env.example  README.md
    docs/  ARCHITECTURE.md  DOM-RECON.md  API-CONTRACT.md  TEST-PLAN.md
    public/icons/
    src/
      entrypoints/
        background.ts                  (wires handlers only)
        reddit.content/index.tsx       (matches www.reddit.com, sh.reddit.com)
        popup/  options/
      adapters/
        types.ts                       (SiteAdapter, MediaRef, MountPoint)
        reddit/ selectors.ts observer.ts spa-navigation.ts
                extract-image.ts extract-gallery.ts extract-video.ts index.ts
      background/
        handlers/ scan-media.ts context-menu.ts
        media-fetcher.ts job-poller.ts keepalive.ts
      core/
        messaging.ts api-client.ts schema.ts cache.ts settings.ts logger.ts
      ui/
        lens-button.ts VerdictPopover.tsx Gauge.tsx ModelBreakdown.tsx
        Spinner.tsx styles.css
    tests/ fixtures/reddit/  unit/  e2e/  mock-server/
    scripts/record-fixture.mjs

  backend/
    pytest.ini  README.md  run_dev.ps1  run_dev.sh
    moody_lens_ext/
      media.py                     detect, jobs/{id}, health, detect-url
      services/url_resolver.py     Tier-2 yt-dlp, isolated
      services/video_prep.py       keyframes + audio extract/mux (ffmpeg)
    tests/
      conftest.py  test_media_api.py
```

Design choices:
- Reddit-specific code sits behind a `SiteAdapter` interface so the universal extension can reuse `core/` and `ui/`.
- One tiny vanilla button per post, and ONE shared React popover (avoids hundreds of React roots in an infinite feed).
- Every selector lives in `src/adapters/reddit/selectors.ts`.

## 3. API contract (v1)

- `POST /api/v1/detect` (multipart: media file, optional audio file, source metadata) returns `202 {job_id}`
- `GET /api/v1/jobs/{id}` returns `{status, overall_score, label, models:{image,face,audio}, model_versions}`
- `GET /api/v1/health`
- `POST /api/v1/detect-url` (Tier-2, feature-flagged)

## 4. Phases

### Phase 0: Recon and contracts (docs/templates only, no product code)
- **Build:**
  - `DOM-RECON.md` template: per post type (image, gallery, video with audio, silent video/GIF, crosspost, text, link, removed, NSFW), record the `outerHTML` sample, where media URLs live, shadow roots yes/no, and SPA navigation behavior.
  - `API-CONTRACT.md` (section 3).
  - `scripts/record-fixture.mjs` to save fixtures.
- **Note:** agents cannot browse live Reddit. Leave recon fields blank for the human to fill. Do not fabricate.
- **Test:** the template is complete and a teammate can fill it in without questions.

### Phase 1: Scaffold and tooling
- **Build:** the tree above with typed stubs and TODO comments. Manifest: MV3, permissions `storage`, `contextMenus`, `alarms`, plus the host permissions in section 1. Scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e`, `zip`. CI workflow running typecheck, lint, test, build. `tests/mock-server` implementing the contract.
- **Test:**
  - `pnpm install && pnpm build` succeeds; `typecheck` and `lint` pass.
  - The extension loads unpacked.
  - The content script logs once on www.reddit.com and sh.reddit.com and does nothing elsewhere.
  - The service worker answers a typed "ping".
  - The mock server satisfies the contract.

### Phase 2: Backend contract (parallel track)
- **Build:**
  - `/detect`, `/jobs/{id}`, `/health`.
  - CORS for the extension origin.
  - Type and size validation.
  - Celery job wiring.
  - Keep zod (extension) and Pydantic (backend) schemas in lockstep, or generate TS types from OpenAPI.
- **Test:**
  - pytest for the endpoints.
  - A curl image upload yields a job that completes.
  - Oversized and wrong-type uploads are rejected cleanly.
  - The mock server and the real server both pass the same zod schema.

### Phase 3: Service worker
- **Build:**
  - Typed messaging.
  - `media-fetcher` with a host allowlist (`i.redd.it`, `preview.redd.it`, `v.redd.it`) and a size cap.
  - API client, job poller with backoff, keepalive port, state in `chrome.storage.session`.
  - Image context menu only. The Reddit video context menu is skipped because the `<video>` source is not a usable URL; use the adapter's permalink instead.
- **Test:**
  - Unit tests with a fake browser API.
  - Kill the worker mid-job and confirm the job resumes.
  - Stop the backend and confirm a clear error state.
  - Request a non-allowlisted host and confirm it is refused.

### Phase 4: Reddit adapter (no UI yet)
- **Build:**
  - MutationObserver with a ~300 ms debounce.
  - IntersectionObserver so only visible posts are processed.
  - Dedupe with a WeakSet plus a marker attribute.
  - Re-scan on SPA navigation and feed/tab switches.
  - Extractors produce `MediaRef {kind, urls, audioUrl?, permalink, postId}`.
- **Test:**
  - Extractors run against Phase 0 fixtures in Vitest (happy-dom).
  - A Playwright "selector canary" against live Reddit fails if zero `shreddit-post` elements are found (manual, not in CI).

### Phase 5: UI injection
- **Build:**
  - Lens button per post in a shadow root; one shared popover with loading, error and result states.
  - Use WXT `createShadowRootUi` with `cssInjectionMode: 'ui'`; unmount on navigation.
  - Tailwind in a shadow root needs `:root` rewritten to `:host` (WXT's UI CSS mode does this). Tailwind v4's `@property` defaults may misbehave in shadow roots, so verify early or use plain CSS for the widget.
- **Test:**
  - Reddit's CSS does not leak in and ours does not leak out.
  - Light and dark mode.
  - Keyboard access.
  - The button does not hijack the post click.
  - Scrolling 200 posts shows no long tasks and no duplicate buttons.

### Phase 6: Video end-to-end
- **Build:**
  - The extension fetches a mid-quality video rendition (360-480p keeps uploads small) plus the audio file and uploads both.
  - The backend does ffmpeg keyframes at a fixed fps, audio extraction, and runs all three detectors.
  - `/detect-url` Tier-2 path behind a feature flag.
- **Test matrix:**
  - Video with audio.
  - Silent video or GIF (no audio result, shown honestly).
  - Very short and very long clips (cap duration).
  - Crosspost.
  - Deleted post.
  - Logged-out NSFW.
  - Backend slower than 30 s.

### Phase 7: Hardening and demo
- **Build:**
  - Cache by post id and media hash.
  - Concurrency limits and rate limiting.
  - Consent screen (media goes to the backend).
  - Auto-scan toggle, OFF by default. v1 is on-demand scanning (click the lens).
  - Selector-drift handling documented.
  - `wxt zip` packaging.
- **Test:**
  - Full regression over known real and fake sample posts.
  - Rehearsed scripted demo.
  - Graceful degradation when Reddit changes markup (the button disappears, nothing crashes).

## 5. Git rules (summary; the main prompt is authoritative)

- Work only on branch `darshan-dev` (create from latest origin/main if missing). Never touch `main`. No force-push, no history rewrite.
- Detailed Conventional Commit messages, one logical change per commit.
- Push to `origin darshan-dev` after each phase, once its tests pass.
- No secrets, `.env` files (only `.env.example`), `node_modules`, build output or large media in commits.

## 6. Reference sources used

- Reddit shreddit markup: github.com/joeuk89/clean-reddit, scrapfly.io/blog/posts/how-to-scrape-reddit-social-data, scrape.do/blog/reddit-scraping
- CRXJS / Vite 8 issue: extension.js.org/docs/migrate/crxjs-content-script-filename-undefined
- WXT shadow-root UI: wxt.dev docs and GitHub discussion #642
- yt-dlp Reddit blocks: github.com/yt-dlp/yt-dlp/issues/15293 and /17965
- Reddit video structure: handancorp.com/blog/best-reddit-video-downloader-extensions
- MV3 cross-origin and service-worker lifetime: developer.chrome.com/docs/extensions/mv3/xhr and DEV Community "Manifest V3 Service Workers: Why Your Chrome Extension Keeps Losing State"
