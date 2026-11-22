# V2 testing and manual acceptance

Recorded 2026-11-22, Windows / Node 22.16.0. No Chrome control or automation.
Baseline was measured on main c8131d1; all existing tests were retained.

| Check | Baseline | Final |
| --- | --- | --- |
| Extension npm test | 90 pass / 5 skip | 121 pass / 6 skip (127 total), 0 failures |
| Provider CJS suite | 13 pass | 13 pass |
| Website npm tests | 39 pass with TypeScript flag | 67 pass, 0 skipped/failures |
| Website build / typecheck | Passed after locked dependency install | Passed |
| Backend/frontend contract parity | Passed | Passed |
| Backend pytest | Collection failed: missing imagehash | No tests executed after isolated install failed; CI required |
| Website lint, Ruff, Mypy | Unavailable | Not run, accepted by user |

Five extension skips require live-server configuration. One additional optional
originals skip means no local ChatGPT/Gemini files were supplied. It is not a pass
or a reduced baseline. Empty-folder tests explicitly report compatibility unverified.
Initial plain website npm test failed on this Node version; its script now includes
--experimental-strip-types and discovers all existing/new test files.

## Commands

```powershell
Set-Location 'D:\Darshan\Mad-Eye-Moody-Lens\Browser_Extension\backend'
npm test
Set-Location 'D:\Darshan\Mad-Eye-Moody-Lens\Browser_Extension'
node --test tests/*.cjs
Set-Location 'D:\Darshan\Mad-Eye-Moody-Lens\functional-ui-models-backend\frontend'
npm ci
npm test
npm run typecheck
npm run build
Set-Location 'D:\Darshan\Mad-Eye-Moody-Lens\functional-ui-models-backend\backend'
python -m scripts.check_parity ../frontend
```

The isolated backend CPU installation timed out at 360 seconds. Requirements
installation then failed on a 15-second files.pythonhosted.org read timeout while
retrieving ast-serialize metadata. The one pytest invocation (60-second cap)
exited No module named pytest. Do not claim backend pytest/Ruff/Mypy passed.

## Automated fixture matrix

| Case | Fixture/check | Expected |
| --- | --- | --- |
| Trusted via injected test root | signed.png / root A | Verified; never install root in production |
| Unknown signer | signed.png, untrusted.png, Firefly | Unknown signer when intact |
| Self-signed leaf | self-signed.png + self-signed-test.crt | Unknown signer; recipe/X509 establishes self-signature, SDK type not inferred |
| Expired | expired-chatgpt.png | Unavailable with expiry reason, separate from mismatch |
| Malformed | truncated.png | Unavailable / malformed explanation |
| Tampered signature/hash | corrupted-signature.png, binding-mismatch.png | Signature invalid |
| Stripped / re-encoded | stripped.jpg, reencoded.jpg, reencoded.webp | No embedded credentials; absence neutral |
| Remote manifest | remote-manifest.jpg | No automatic fetch; explicit SDK refusal tested directly |
| Every hint | provenance-hints-v2 + metadata tests | Unsigned, capped; prompt/workflow presence only |
| Hostile text/chunks | parser fuzz/bombs, panel/React escaping | No HTML execution or unbounded output |
| Quick switch / clear | panel observer and website runner | Abort/suppress obsolete results |
| Local originals | fixtures/real-world (gitignored) | Clean skip when empty; status only if supplied |

The checksum-verified official c2patool 0.29.0 was rerun with offline settings for
signed/untrusted/corrupt/binding/self-signed/expired in two trust modes. All 12
fresh CLI/WASM states and code sets agree. Older SDK parses C2PA 2.4.0. Production
worker tests replace fetch/XHR/WebSocket/importScripts/sendBeacon with failing
spies, independently prove the guards throw, then assert zero verification calls
for remote-only, unknown and expired files in both clients. Effective settings
are read back; website parent WASM compilation is forbidden in the test.
The Node bridge supplies browser transport/FileReaderSync, not cryptography.
Website JSON parity now covers every bundled image, plus exact pure-copy bytes.

HTTP-only Vite preview smoke served HTML, card, SDK, guarded worker, upstream
worker and WASM (application/wasm). Main JS has no SDK/WASM logic. Main mounting
code grew about 0.79 kB; SDK/9.06 MB WASM/CSS/worker are lazy resources. The existing
large-main-chunk warning remains. Neither HTTP nor Node proves native Chrome CSP.

## Manual Chrome checklist (pending; user performs)

1. Load unpacked D:/Darshan/Mad-Eye-Moody-Lens/Browser_Extension (uppercase).
   Reload the extension and reopen its side panel. Keep auto scanning off while
   checking provenance privacy. No build/API key/backend is needed for provenance.
2. Upload signed.png, untrusted.png, self-signed.png, corrupted-signature.png,
   binding-mismatch.png, truncated.png, expired-chatgpt.png, stripped.jpg,
   reencoded.webp, remote-manifest.jpg and a GIF. Compare the matrix above.
   Re-check and Clear must work. Never add test roots to make a green badge.
3. Use actual original ChatGPT and Gemini downloads, then a re-saved WebP/JPEG
   and screenshot. Record results rather than assuming every export has credentials.
   Missing metadata proves nothing. These originals were not tested by the agent.
4. Inspect side-panel DevTools and its worker. After packaged resources load,
   verification must send no image, remote manifest, OCSP or trust-list requests.
   Image URL acquisition is a separate initial download. Detecting via Analyze
   separately sends data to the selected provider as before.
5. Select files rapidly, clear while checking, and switch away. Old results must
   not overwrite the new image. Stop/unconfigure the detector: provenance must
   remain visible and independent. Confirm existing provider/API/image downloads.
6. Website: run npm run dev in functional-ui-models-backend/frontend and open
   http://localhost:5173. Select an image without submitting it. Origin check
   appears and finishes independently; with a detector result it sits beside it.
   Repeat the fixtures, original downloads, detector-down and quick-switch cases.
   Switch image/audio/video tabs; no old image origin card may remain.
7. Website Network: only same-origin feature JS/WASM may load before Analyze.
   Check deployed nginx/Vercel too; no CSP values were changed. WASM compiles in
   the guarded worker. If worker/WASM is blocked, expect a short Unavailable
   message, not a crash or an invented origin conclusion.
8. Check narrow/mobile widths, keyboard focus, live status, collapsed explainer,
   unsigned chips and four dots. No percentages or detector-score merging.
   Vendor links open new tabs with no automatic image transfer; upload there
   separately. Inspect storage: provenance adds no history/storage/log/export.
9. Record Chrome version, OS, each result, console/CSP/worker errors and network
   observations in the PR. Full CI, review and these manual checks remain gates.

## Historical v1 testing log

The earlier results below describe the merged v1 implementation and its original
SDK/classifier. The v2 matrix and results above supersede those expectations.

# Testing and acceptance

Recorded 2026-11-21 on Windows, Node 22.16.0. No Chrome automation was used.

## Commands and results

| Command / location | Baseline | Final automated result |
| --- | --- | --- |
| npm test in Browser_Extension/backend | 31 total: 26 pass, 5 skip | 80 total: 75 pass, 5 skip, 0 fail |
| node --test tests/*.cjs in Browser_Extension | 13 pass | 13 pass, 0 fail |
| node --test tests/provenance-*.test.mjs in Browser_Extension/backend | Absent | 49 provenance tests pass |
| python -m scripts.check_parity ../frontend in website backend | Optional broader check | Passed |
| MML_DETECTOR_BACKEND=stub + python -m pytest -q -p no:cacheprovider | Optional broader check | Attempted; no output after several minutes; interrupted, not a pass |
| Ruff / Mypy | Optional broader checks | Not run: neither tool/module installed |
| npm run build in website frontend | Optional broader check | Failed TS2688: missing vite/client type definitions (dependencies absent) |

Five extension skips require MML_E2E_URL. No extension baseline tests were removed
or weakened. Both extension suites ran before every commit and before push.
Backend/website source was not modified; do not represent the incomplete optional
checks as passing. Full CI remains a pre-merge gate.

## What Node verifies

- Metadata (15 tests): nine fixture expectations, PNG tEXt/iTXt/zTXt, JPEG
  EXIF/XMP, WebP EXIF/XMP/C2PA, Windows-1252 alias independence, field/chunk caps,
  compressed bombs including a per-file inflation work budget, all truncations
  of two small files, and 500 deterministic fuzz inputs.
- Bytes (5 tests): SHA-256 input/output equality for six original fixture files
  through data URIs and mocked streamed fetches; raw percent bytes; public-host
  exclusions; redirect rejection; declared/streamed 8 MiB caps; cancellation and
  fetch/body timeouts. Hashes exist only in test assertions, never runtime output.
- Verifier (17 tests): real vendored WASM, actual SDK Context serialization using
  official offline trust anchors, no trust-resource/verification fetches, SDK/CLI
  agreement in eight signed-fixture/trust-store combinations, malformed/no-credential
  reads, classification, file hashes/one-line worker patch, initialization options
  and timeout/failure branches. The official WasmReader.fromBytes Node entry point
  executes cryptography. Adapter setup uses mocks for browser APIs.
- Declarations (5 tests): real active manifest, exact IPTC AI/capture source URIs,
  ingredient/other-manifest isolation, claimed time, unknown/malicious actions,
  truncated and conflicting declarations.
- Panel (7 tests): a minimal DOM double rejects any innerHTML use; all six badges,
  literal malicious strings, limits, stale async results, clear/reset, disagreement
  freshness, provider/key independence, error fallback, Re-check/focus, teardown,
  and classic-script/module HTML hooks. The double is not a browser layout test.

Recorded CLI reports came from c2patool 0.29.0; tests rerun WASM and compare
validation states and code sets. Signed fixtures are documented in
[FIXTURES.md](../../backend/tests/fixtures/provenance/FIXTURES.md). Regeneration
requires Python Pillow/cryptography and the official c2patool binary. Never
commit generated private keys or add test-root-A.crt to runtime anchors.

## Manual Chrome checklist — user must run; currently pending

Public original-image links and all six status acceptance cases are listed in
[SAMPLE_IMAGES.md](SAMPLE_IMAGES.md). Firefly_tabby_cat.jpg is also bundled in the
existing backend/tests/fixtures/provenance/ folder for a direct local upload.

1. Open chrome://extensions, enable Developer mode, and Load unpacked
   **Browser_Extension/**. Reload after pulling new commits. Open the side panel.
   The lowercase directory is not the extension under test.
2. Open the side panel's own DevTools (inspect the side-panel page). Clear Console
   and Network. Verify no CSP, unresolved-module, worker or WASM errors. Packaged
   worker, WASM, JS and anchor requests must use this extension's origin. The
   manifest adds only script-src 'self' 'wasm-unsafe-eval'; object-src 'self';.
   This policy is based on official Chrome documentation; Chrome enforcement and
   packaged-worker startup have not been verified by the agent.
3. Use the existing Choose file control for every image below. Provenance must
   run before clicking Analyze, with these exact expected badges:

   | Fixture | Badge / content |
   | --- | --- |
   | plain.png | No credentials found |
   | stable-diffusion.png | No credentials found; unsigned Stable Diffusion parameters |
   | compressed-metadata.png | No credentials found; unsigned Software/ComfyUI prompt hints |
   | stripped.jpg | No credentials found |
   | large-stripped.jpg | No credentials found after SDK read (regression case) |
   | signed.png | Unknown signer; Signer A; declared AI; four recorded actions |
   | untrusted.png | Unknown signer; Signer B; declared AI; four recorded actions |
   | Firefly_tabby_cat.jpg | Unknown signer; Adobe Firefly C2PA; Adobe_Firefly; declared AI-generated; Created |
   | corrupted-signature.png | Signature invalid; claimSignature.mismatch in SDK codes |
   | binding-mismatch.png | Signature invalid; assertion.dataHash.mismatch in SDK codes |
   | truncated.png | Signature invalid; image preview may itself be undecodable |

   Neither test signer belongs to the official trust snapshot. Verified credentials
   is proven automatically only through explicit test-root injection, not a
   production trust bypass. An independently trusted real-world sample may verify
   against the snapshot; never change runtime anchors to make a fixture green.
4. With an uploaded file, inspect Network (including the dedicated worker): there
   must be **no outgoing HTTP(S) requests** during verification. chrome-extension
   resource reads are expected. No manifest, trust list, OCSP, icon, ingredient or
   thumbnail may be downloaded. Avoid clicking Analyze during this isolated
   privacy check because existing detectors intentionally contact providers.
5. Repeat with BitMind, ZeroTrue, custom REST and Moody Lens selected. Remove the
   API key or use a known failing detector configuration. File provenance must
   finish independently and remain visible after detector failure. Existing
   scores, verdicts, reports, provider choices and settings must behave as before.
6. On a normal public page, right-click an image and use the existing Moody Lens
   review action. The resulting #preview selection must trigger provenance. An
   inaccessible/CORS-restricted/redirecting image must show Unavailable with the
   suggestion to upload the original file. Do not grant new host permissions for
   this feature. For URLs, an initial image GET is expected; verification itself
   must make no external request.
7. Switch signed/stripped/corrupt images rapidly, clear while checking, and use
   Re-check. Old results must never replace the new selection. Clear must say No
   image selected and retain the caution. Re-check must repeat without persistence.
8. Analyze a signed AI-declaring fixture with a detector returning likely real.
   Both results must stay visible with the neutral disagreement note. Previous
   image verdicts are suppressed until a new detector analysis cycle is observed.
9. Check a GIF (Unsupported format), an over-limit original (>8 MiB), and an
   inaccessible URL (Unavailable). Missing credentials must never imply real.
10. Confirm all file text is literal, hints/prompts are truncated, keyboard focus
    works, status is announced, narrow layouts are usable, and both cautions show.
    Inspect Application storage before/after: provenance must add no storage data.
    Existing detector history/pendingReviewImage storage is outside this feature.

Record Chrome version, OS, fixture outcomes and console/network observations in
the PR. If CSP/worker/WASM initialization fails, mark the check failed and do not
merge until corrected. No Chrome behavior above is claimed as manually passed.

## CI gap

Current CI runs only background.test.mjs in both extension folders. It does not
run these provenance tests, the CJS provider suite, or the Chrome checklist.
Optional separate team-approved one-line follow-up: replace the uppercase
background-test command with npm --prefix Browser_Extension/backend test.
No .github file was changed here. CI also runs backend pytest/Ruff/Mypy/parity,
the website TypeScript/Vite build, Telegram unit tests and Docker build.

## Manual findings and unsigned-JPEG fix (2026-11-21)

The user reports signed.png shows Unknown signer with declaration details in
Chrome. This confirms that their loaded build can initialize the packaged worker
and WASM; it is not a blanket CSP/startup failure. Ordinary local images showed
Unavailable. A regression reproduced the adapter incorrectly dereferencing the
public SDK's null Reader for no credentials; raw WASM tests had missed this public
wrapper behavior. The fix handles exactly null as no_credentials. The new large
unsigned JPEG forces the SDK path rather than the cheap marker-absence shortcut.
The regression uses the actual browser Reader and actual WASM with a worker-RPC
test double; it failed before the fix and passes after it. Undefined readers and
unknown errors remain unavailable. Diagnostics tests cover distinct failures and
reject raw exception/URL/prompt leakage; UI tests distinguish unread from absent.

After reloading both the extension and its side-panel page, retest large-stripped.jpg
and an ordinary local JPEG: expect No credentials found if credentials are absent.
Retest signed.png (Unknown signer) and corrupted-signature.png (Signature invalid).
A blocked website URL may legitimately remain Unavailable and should now explain
that the original bytes could not be read. This post-fix Chrome retest, network
privacy checks, and the remaining manual items are still pending user confirmation.

## V2 baseline and pre-commit-1 verification (2026-11-22)

Re-run before commit 1: extension npm test 95 total / 90 passed / 5 live-server
skips / 0 failures; provider CJS suite 13 passed; website tests 39 passed using
node --experimental-strip-types --test with the three existing test files;
website build and typecheck passed; backend/frontend parity passed. Existing
large-main-chunk build warning remains. No baseline tests were removed.
These results use the installed 0.17.1 extension SDK, not a completed 0.16.0 repin.

The earlier isolated backend CPU install timed out at 360 seconds. An attempt
with requirements.txt and requirements-dev.txt failed downloading ast-serialize
metadata (15-second network read timeout). The one subsequent pytest invocation,
bounded to 60 seconds, exited 1: No module named pytest. No tests executed there;
leave backend validation to CI. Website lint, Ruff and Mypy are not run as
accepted by the user. No Chrome automation/manual Chrome run is claimed.

Repin cryptographic agreement, effective-settings, parent/worker failing-spy
privacy tests and real-world local-original tests remain pending. The optional
real-world directory did not exist; do not claim ChatGPT/Gemini compatibility.

Pre-commit-2 results: extension 98 total / 93 passed / 5 skipped / 0 failed;
provenance subset 52 passed; providers 13 passed. Website build/typecheck and
39 existing website tests passed. Exact 0.16.0 npm audit: 8 signatures and
4 attestations verified. No new test skips or removed baseline tests.

Pre-commit-3: extension 111 total / 106 passed / 5 skipped / 0 failed;
providers 13 passed; website 39 passed, build and typecheck passed.

Pre-commit-4: extension 115 total / 110 passed / 5 skipped / 0 failed;
providers 13 passed; website 39 passed, build/typecheck passed.

Pre-commit-5: extension 116 total / 111 passed / 5 skipped / 0 failed;
providers 13 passed; website 63 passed, build/typecheck passed. All seven pure
logic copies and fixture JSON agree. Main JS grew about 0.79 kB for mounting;
SDK, 9.06 MB WASM, worker and feature CSS are separate lazy assets. No site-wide
CSP change or native Chrome run is claimed.

Pre-commit-5 HTTP-only preview smoke: HTML and six lazy JS/WASM resources returned
200; WASM served as application/wasm. Initial sandbox localhost access was denied;
the approved local-network retry passed and stopped its helper. No browser used.
