# Provenance v2 status

2026-11-22, branch feature/provenance-v2-website, base c8131d1. V1 is already
merged; this is not a stacked PR. The six planned commits deliver the implementation, fixture matrix and final
documentation. Final results: extension 121 pass / 6 skip (127 total), providers
13 pass, website 67 pass; build/typecheck and backend/frontend parity pass. No browser was controlled.

Implemented: cautious six-state classification, separated integrity/certificate/
malformed reasons, bounded unsigned hints without prompt retention, evidence
strip, deterministic absence explanation, fixed vendor links, lazy website card,
original-byte reads, stale-result suppression, SDK repin and offline worker tests.

Both clients use official @contentauth/c2pa-web 0.16.0 / utilities 0.4.0. The
0.17.1 age exception is withdrawn; its trust-fetch finding remains in SDK_AUDIT.
Achieved isolation is the approved neutralized-worker fallback, defence in depth,
not a CSP guarantee. Existing manifest and site CSP values are unchanged.
Website WASM compiles inside its guarded worker. Only its own resource is fetched
during startup; no image is sent by provenance. Existing detectors/downloads work
through their separate unchanged paths and regression suites.

Validation: all 12 fresh CLI/WASM state/code comparisons passed using the
checksum-verified official c2patool 0.29.0. C2PA 2.4.0 fixtures parse with the older
SDK. Signed trusted is proven by injected root A only, never a production bypass.
Website tests exercise all six states, escaping, original bytes and races; pure
copies and per-fixture JSON must match. Final counts are recorded in TESTING.md.

Limitations: no native Chrome/layout/CSP enforcement test; no user-supplied
ChatGPT/Gemini originals (optional test skips). Self-signed fixture is established
by its recipe and public certificate verification; the SDK cannot reliably
identify certificate type for arbitrary files, so the UI says not established.
TC260 key not verified: skipped. Source-host snapshot contains Cloudflare Images
only. No SynthID reader or generator-confirmation claim.

Backend pytest did not execute: isolated dependency installation failed after
CPU-install timeout and a metadata download timeout; the one bounded pytest
attempt exited No module named pytest. Leave it to CI. Website lint, Ruff and
Mypy not run, as accepted. No backend/teammate code or .github edits.
