# Testing and manual acceptance

Baseline on 2026-11-21, before changes:

- `cd Browser_Extension/backend; npm test`: 31 tests, 26 passed, 5 skipped
  (MML_E2E_URL unset), no failures.
- `cd Browser_Extension; node --test tests/*.cjs`: 13 passed, no failures.

New tests use `backend/tests/provenance-*.test.mjs`, included by `npm test`.
Run both commands before each commit and again before pushing.

The metadata/fixture commit adds 12 passing tests: PNG tEXt/iTXt/zTXt,
decompression limits, JPEG EXIF/XMP, WebP chunks, malicious text, every truncation
of small PNG/JPEG files, and 500 deterministic fuzz inputs. Fixtures and their
exact CLI signing/corruption recipes are in backend/tests/fixtures/provenance/.
Both signed fixtures show **Unknown signer** with production trust anchors;
**Verified credentials** is tested only with the explicit test-root-A injection.
Never add that test root to the production trust list.

Byte tests compare SHA-256 input/output equality for all six required fixtures
through base64 data URIs and mocked multi-part streamed fetches. They also cover
raw percent bytes, unsafe hosts/redirect policy, declared and streamed oversize,
fetch/body timeouts, cancellation and HTTP failures. Hashes are test assertions;
runtime acquisition does not calculate, display, export or persist hashes.

Verification tests execute the vendored 9,162,406-byte WASM in Node using its
official `WasmReader.fromBytes` entry point. Four signed fixture variants are
cross-checked against actual c2patool 0.29.0 reports with empty and test-root-A
trust stores (eight cases). Network fetch is forbidden in these tests. They test
real cryptography, not a mock signature implementation. Classification branch
tests additionally use recorded SDK reports and clearly marked synthetic failures
for expiry/unknown-code cases. Adapter initialization/settings/timeout and worker
URL validation are isolated tests. Browser worker execution is still manual.

The minimal manifest change adds only `script-src 'self' 'wasm-unsafe-eval';
object-src 'self';` as extension_pages CSP. This is required by official Chrome
documentation; it has **not** been validated in Chrome by this agent. If the user
observes a CSP/worker/WASM error, treat the real Chrome path as failing and do not
merge until the checklist passes. No remote-code or blob-worker CSP is added.

## Manual Chrome checklist (user runs; not automated)

- Load `Browser_Extension/` unpacked at chrome://extensions and open its side panel.
- Upload every provenance fixture. Compare its badge with the fixture's expected
  JSON. Exact expected badges will be listed when fixtures are added.
- Open side panel DevTools. Confirm no CSP, worker, module resolution, or WASM
  errors. Confirm worker/WASM URLs begin with this extension's origin.
- In Network, verify an uploaded-file check sends no external requests. For URL
  input, distinguish the initial image GET from verification. There must be no
  remote manifest, trust, OCSP, icon, ingredient, or thumbnail GET.
- Repeat with each provider: BitMind, ZeroTrue, custom REST, Moody Lens. Repeat
  with no API key and with a deliberately failing detector. Provenance completes
  independently; detector scores and verdict text remain unchanged.
- Right-click a public image on a normal webpage and use the existing review
  action. Confirm its preview triggers provenance, or Unavailable suggests upload
  when site access/download fails. Do not grant new permissions for this feature.
- Switch images rapidly, clear, and Re-check. Old results must not replace the
  current selection, and clear must reset the panel.
- Inspect narrow layouts, keyboard focus, status announcements, and malicious
  metadata strings. They must display as literal, capped text.

Browser automation is explicitly excluded by user instruction. Node tests cannot
establish Chrome CSP enforcement, side-panel layout, real extension worker
startup, actual host permissions, or real provider integration.

CI currently runs only background.test.mjs in both extension directories, not
the provenance suite. A separate team-approved follow-up could replace the
uppercase command with `cd Browser_Extension/backend && npm test`. Do not edit CI
as part of this feature.
