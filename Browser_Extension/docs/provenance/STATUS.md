# Provenance v2 status

2026-11-22. Branch feature/provenance-v2-website, base c8131d1 (latest main when
pulled). The v1 provenance feature is already merged. This is not a stacked PR.

Commit 1: design/audit documentation. No v2 runtime changes or website origin
card yet. SDK target 0.16.0 is approved; installed extension still uses 0.17.1
until commit 2. The age exception is withdrawn. Network ban is scoped to the
provenance verifier; existing CSP values and detector connections stay intact.

| Gate before commit 1 | Result |
| --- | --- |
| Extension npm test | 95 total: 90 passed, 5 skipped, 0 failed |
| Provider CJS suite | 13 passed |
| Website tests with Node TypeScript stripping | 39 passed |
| Website build and typecheck | Passed; pre-existing large-chunk warning |
| Backend/frontend contract parity | Passed |
| Website lint, Ruff, Mypy | Not run; accepted by user |
| Isolated backend pytest attempt | No tests executed: requirements download timeout, then missing pytest |
| Manual Chrome | Not run; user will perform it |
| Local ChatGPT/Gemini originals | Not present; compatibility unverified |

Commits 2-6 remain pending. SDK re-vendor/effective settings, neutralized-worker
network spies, classification, hints, extension UI, website integration and
fixture parity are not yet implemented or claimed passed. Stop/report breakage.
