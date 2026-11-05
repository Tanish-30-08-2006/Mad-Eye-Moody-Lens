# Moody Lens – Reddit Deepfake Detection Extension

Moody Lens is a Manifest V3 browser extension built with **WXT**, **React 19**, and **TypeScript**, targeting Reddit (`www.reddit.com` and `sh.reddit.com`). It injects an in-feed scan button on `<shreddit-post>` elements, allowing users to verify media authenticity against the local Moody Lens backend service.

---

## Architecture & Guarantees

- **Manifest V3 Compliant**: All media downloads and external network traffic are routed strictly through the background service worker. The content script communicates via typed runtime messaging (`src/core/messaging.ts`).
- **Encapsulated UI**: The per-post lens trigger is mounted inside an isolated shadow root (`cssInjectionMode: 'ui'`) to prevent Reddit's stylesheets from bleeding into the button and vice versa.
- **Shared Singleton Popover**: Avoids rendering hundreds of React roots in an infinite scrolling feed by sharing a single verdict popover anchored to the active post button.
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
      handlers/             # Modular message handlers (scan, context menu)
      media-fetcher.ts      # Session-aware CDN media fetcher
      job-poller.ts         # Asynchronous job poller with backoff
      keepalive.ts          # Port keepalive & session storage state
    core/
      messaging.ts          # Typed message passing protocol
      api-client.ts         # Backend REST API client
      schema.ts             # Zod schema definitions for API contracts
      cache.ts              # LocalStorage scan result caching
      settings.ts           # Settings persistence
      logger.ts             # Namespaced structured logger
    ui/
      lens-button.ts        # Vanilla button factory for post injection
      VerdictPopover.tsx    # Shared React verdict popover
      Gauge.tsx             # Score gauge visualizer
      ModelBreakdown.tsx    # Multi-model score display
      Spinner.tsx           # Loading state indicator
      styles.css            # Scoped widget styling
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

# Run mock backend server
pnpm mock-server
```
