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
│   │   ├── adapters/          # SiteAdapter DOM extractors for Reddit
│   │   ├── background/        # Keepalive, media fetcher, job poller
│   │   ├── core/              # API client, cache, messaging, Zod schemas
│   │   └── ui/                # Scoped popover, gauge, breakdown, buttons
│   ├── tests/                 # Unit, contract parity, and E2E test suites
│   └── docs/                  # API contracts, architecture, and DOM recon
└── backend/                   # Extension Backend Integration
    ├── README.md              # Backend layout and runner documentation
    ├── pytest.ini             # Pytest configuration with dual pythonpath
    ├── run_dev.ps1            # Windows PowerShell dev server launcher
    ├── run_dev.sh             # Unix/macOS Bash dev server launcher
    ├── moody_lens_ext/        # Extension API endpoints and service stubs
    │   ├── __init__.py
    │   ├── media.py           # V1 media detection endpoints (/api/v1/detect, /jobs, /health)
    │   └── services/          # Tier-2 ingestion and preprocessing stubs
    │       ├── __init__.py
    │       ├── url_resolver.py
    │       └── video_prep.py
    └── tests/                 # Isolated test harness and test suite
        ├── conftest.py        # Test fixtures (fakeredis, SQLite, stub detectors)
        └── test_media_api.py  # 13 contract, endpoint, and error tests
```

---

## Getting Started

### 1. Frontend Extension (`reddit_extension/frontend`)

```bash
cd reddit_extension/frontend

# Install dependencies with frozen lockfile
pnpm install --frozen-lockfile

# Typecheck and lint
pnpm typecheck
pnpm lint

# Run unit and contract tests (55 tests)
pnpm test

# Build for Chrome MV3 (.output/chrome-mv3)
pnpm build
```

**Loading into Chrome**:
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in upper right).
3. Click **Load unpacked** and select `reddit_extension/frontend/.output/chrome-mv3`.

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

---

## Docker Caveat

> [!WARNING]
> The host Dockerfile (`functional-ui-models-backend/Dockerfile`) builds strictly from `functional-ui-models-backend/backend/` and does **not** include `reddit_extension/backend/` on its `PYTHONPATH`. 
> 
> When running inside existing Docker containers, the host backend gracefully logs `reddit_extension_router_unavailable` via the guarded import in `app/main.py`. Packaging extension endpoints into the production container requires a Dockerfile / build configuration change that must be approved by the repository owner (not included in this repository reorganization).
