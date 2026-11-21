# Future-agent briefing

Purpose: local file provenance alongside the independent image detector.
Branch: feature/image-provenance-check. Never commit main or open/merge a PR.

Invariants: preserve bytes; 8 MiB cap; SDK-only crypto; offline trust snapshot;
remote manifests/OCSP disabled; no persistence/logging/export; bounded textContent
rendering; separate AI declaration and signature/trust status; missing credentials
are neutral; stale selections cannot update the UI.

Runtime map: frontend/provenance/{bytes,metadata-reader,c2pa-verifier,declarations,
provenance-core,provenance-panel}.js and provenance.css; vendor/c2pa contains
packaged SDK/WASM/worker, licences, pristine/patched code and provenance hashes.
Tests/fixtures: backend/tests/provenance-*.test.mjs and fixtures/provenance/.
Contract: RESULT_CONTRACT.md, schemaVersion 1, six result states.

Only existing sidepanel.html receives the container, stylesheet, and module tag.
The minimum WASM CSP in manifest.json is the documented exception, with browser
confirmation delegated to the user's manual checklist. No modifications to
sidepanel.js, background.js, content.js, providers, audio, backend, website, CI,
or lowercase browser-extension. History rows have no click behavior: skip them.

Tests: Browser_Extension/backend -> npm test; Browser_Extension -> node --test
tests/*.cjs. Baseline 26 pass + 5 skip and 13 pass. All Chrome checks are manual;
do not use Chrome automation. CI only runs selected extension background tests.
Implementation status and next steps are recorded in ISSUES_MAP.md/TESTING.md.
