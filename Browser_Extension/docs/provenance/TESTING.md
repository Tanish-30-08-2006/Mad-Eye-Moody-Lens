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
