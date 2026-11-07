# Moody Lens – Reddit Deepfake Detection Extension

Moody Lens is a Manifest V3 browser extension built with **WXT**, **React 19**, and **TypeScript**, targeting Reddit (`www.reddit.com` and `sh.reddit.com`). It injects an in-feed scan button on `<shreddit-post>` elements, allowing users to verify media authenticity against the local Moody Lens backend service.

---

## Architecture & Guarantees

- **Manifest V3 Compliant**: All media downloads and external network traffic are routed strictly through the background service worker. The content script communicates via typed runtime messaging (`src/core/messaging.ts`).
- **Encapsulated UI**: The per-post lens trigger is mounted inside an isolated shadow root (`cssInjectionMode: 'ui'`) to prevent Reddit's stylesheets from bleeding into the button and vice versa.
- **Shared Singleton Popover**: Avoids rendering hundreds of React roots in an infinite scrolling feed by sharing a single verdict popover, placed next to the clicked lens and closed on Esc, outside click or navigation.
- **Consent first**: The service worker refuses every scan until the user agrees to upload media to their backend. Auto-scan, server fallback and Debug are all off by default.
- **Honest results**: Detectors that did not run show "not run"; mock backends are flagged with a DEMO DATA badge everywhere a verdict appears.
- **SiteAdapter Pattern**: DOM parsing and selector queries are decoupled behind the `SiteAdapter` interface (`src/adapters/types.ts`), isolating platform changes to `src/adapters/reddit/`.

---

## Directory Structure

```
reddit_extension/frontend/
  package.json              # Package definition & scripts
  wxt.config.ts             # WXT framework & MV3 manifest configuration
  tsconfig.json             # Strict TypeScript configuration
  eslint.config.js          # ESLint flat config
  vitest.config.ts          # Unit test configuration
  playwright.config.ts      # E2E test configuration
  .env.example              # Sample environment variables
  docs/                     # Architecture, recon, and test plan docs
    ARCHITECTURE.md
    DOM-RECON.md
    API-CONTRACT.md
    TEST-PLAN.md
    MANUAL-TEST.md          # What to verify in real Chrome on real Reddit
  public/icons/             # Extension icons (16, 32, 48, 128)
  src/
    entrypoints/
      background.ts         # Service worker message routers & handlers
      reddit.content/       # Content script targeting Reddit feeds
      popup/                # Extension toolbar popup
      options/              # Extension settings page
    adapters/
      types.ts              # SiteAdapter, MediaRef, MountPoint
      reddit/               # Selectors, observer, extractors, navigation
    background/
      handlers/             # Scan handler (consent, cache, queue) and image context menu
      scan-queue.ts         # 2 concurrent scans, in-flight dedupe, auto-scan rate cap
      rendition.ts          # Picks the progressive MP4 rendition to upload
      errors.ts             # Typed errors to friendly messages
      media-fetcher.ts      # Session-aware CDN media fetcher
      job-poller.ts         # Asynchronous job poller with backoff
      keepalive.ts          # Port keepalive & session storage state
    content/
      controller.ts         # Adapter + lens buttons + shared popover glue
    core/
      messaging.ts          # Typed, validated message passing
      api-client.ts         # Backend REST API client
      schema.ts             # Zod schema definitions for API contracts
      cache.ts              # Verdict cache (chrome.storage.local)
      settings.ts           # Settings persistence and validation
      consent.ts            # First-run upload consent
      media-url.ts          # Media host allowlist (shared)
      debug.ts, logger.ts   # Debug-gated structured logging
    ui/
      lens-button.ts        # Vanilla per-post lens button
      popover-host.tsx      # The single shared popover (positioning, close triggers)
      VerdictPopover.tsx    # Popover content: loading, verdict, error + retry, consent
      Gauge.tsx, ModelBreakdown.tsx, Spinner.tsx, position.ts
      styles.css            # Plain CSS, light and dark
  tests/
    fixtures/reddit/        # Saved HTML DOM samples
    unit/                   # Vitest unit test suite
    e2e/                    # Playwright end-to-end tests
    mock-server/            # Local Node mock backend for development
  scripts/
    record-fixture.mjs      # CLI fixture capture utility
```

---

## Development

### Prerequisites
- Node.js >= 22
- pnpm >= 10

### Tooling & Pinned Versions
| Dependency | Exact Version | Role / Compatibility Note |
|---|---|---|
| `node` | `>=22` | Runtime engine |
| `pnpm` | `10.33.0` | Package manager |
| `wxt` | `0.21.5` | Next-gen MV3 framework |
| `vite` | `8.3.5` | Bundler (supported via WXT/module-react peerDependencies `^6.3.4 \|\| ^7.0.0 \|\| ^8.0.0-0`) |
| `vitest` | `3.1.4` | Unit test runner |
| `react` | `19.3.1` | UI library |
| `react-dom` | `19.3.1` | UI rendering |
| `zod` | `3.24.4` | Runtime schema validation |
| `typescript` | `5.8.3` | Typechecker |
| `happy-dom` | `21.0.4` | DOM for unit tests |
| `@playwright/test` | `1.52.0` | Optional real-Chrome smoke test |

### Commands
```bash
# Install dependencies
pnpm install

# Start extension in development mode
pnpm dev

# Build for production (.output/chrome-mv3)
pnpm build

# Type check
pnpm typecheck

# Lint codebase
pnpm lint

# Run unit tests
pnpm test

# Optional real-Chrome smoke test (build first; set CHROME_PATH if Chrome is not at /usr/bin/google-chrome)
pnpm test:e2e

# Run mock backend server (answers with DEMO data)
pnpm mock-server
```

### Load the built extension
Chrome: `chrome://extensions` -> Developer mode -> **Load unpacked** -> `frontend/.output/chrome-mv3`.

### Settings (Options page)
| Setting | Default | Notes |
|---|---|---|
| Backend URL | `http://localhost:8000` | http(s) only; Chrome asks for access to any other origin |
| Auto-scan visible images | off | Images only, never video, rate limited |
| Server fallback for videos | off | Needs backend `FEATURE_DETECT_URL=true` |
| Debug | off | Verbose logs; a lens click dumps what the extractors found |

### Selector drift
Only `post-type`, `content-href`, `permalink`, `id` and `post-title` are verified Reddit attributes. Every other selector lives in `src/adapters/reddit/selectors.ts` marked `// UNVERIFIED: confirm in DevTools`. If lenses stop appearing, turn on Debug, click a lens, and fix the selectors from the logged dump.

## UI preview and icons

- `node scripts/build-preview.mjs --shots` rebuilds `docs/ui-preview.html` and screenshots in `docs/screens/` (needs Chrome).
- `node scripts/make-icons.mjs` regenerates `public/icons/` from the colours in `src/ui/tokens.css`.
