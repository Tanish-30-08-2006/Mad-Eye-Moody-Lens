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

Commit 2 work: re-vendored official 0.16.0 and pinned website dependency/lock;
refreshed unchanged official trust snapshots; hardened extension worker; added
real worker network-spy/effective-settings checks and cautious classifier reasons.
The network fallback is defence in depth, not CSP isolation. C2PA 2.4.0 parsing
and eight pre-existing c2patool comparisons passed after the repin. Website card
and website privacy/parity tests remain pending for commits 5-6.

Pre-commit-2 results: extension 98 total / 93 passed / 5 skipped / 0 failed;
provenance subset 52 passed; providers 13 passed. Website build/typecheck and
39 existing website tests passed. Exact 0.16.0 npm audit: 8 signatures and
4 attestations verified. No new test skips or removed baseline tests.

Commit 3: bounded unsigned hints now cover the four IPTC source types, 2025.1
AI system/version, CreatorTool/Software, SD/ComfyUI marker presence, NovelAI and
Midjourney job markers. Fixed family mapping never changes status or detector
results. Prompt/workflow contents are not retained. Unknown tool scalars are
truncated. TC260 is skipped because its exact key was not verified.

Pre-commit-3: extension 111 total / 106 passed / 5 skipped / 0 failed;
providers 13 passed; website 39 passed, build and typecheck passed.

Commit 4: extension evidence dots, unsigned chips, collapsed deterministic
absence explanation and fixed OpenAI/Google link-outs implemented. Only the
reviewed exact imagedelivery.net host has an extra processed-variant note;
website usage suppresses all host facts. Unavailable/unsupported never means
absence. Links transfer no image automatically and explain vendor-side uploads.

Pre-commit-4: extension 115 total / 110 passed / 5 skipped / 0 failed;
providers 13 passed; website 39 passed, build/typecheck passed.
