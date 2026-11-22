# Future-agent briefing

Purpose: local image-file provenance alongside the independent detector.
Branch: feature/image-provenance-check. Seven planned commits plus manual-test
and sample-documentation follow-ups; do not commit
main, force-push, or create/merge a PR. User will open one PR for five issues.

Status: implementation and Node tests complete; Chrome checklist PENDING. Do not
use Chrome automation. Never claim Node establishes real MV3 CSP/worker behavior.

## Invariants

- Preserve original bytes; 8 MiB cap, public HTTP(S), omit credentials, no cache,
  no redirects/permission requests; failed reads suggest original-file upload.
- SDK-only cryptography: @contentauth/c2pa-web 0.17.1, wasm 0.15.1, all packaged.
- Local official C2PA signer/TSA PEM snapshots dated 2026-11-21; no runtime trust
  updates, remote manifests or OCSP; dedicated worker also rejects network fetch.
- No persistence/logging/export of images, manifests, prompts, metadata or hashes.
  No runtime hash feature/cache. Test hashes and vendored-software hashes are separate.
- File text is length-capped textContent; hints explicitly unsigned/forgeable.
- schemaVersion 1, six states in RESULT_CONTRACT.md; separate signature/trust/AI
  declaration; missing credentials are neutral. Never merge detector scores.
- Abort + generation + current-src checks prevent stale rendering. A previous
  detector verdict does not produce a disagreement note for a new preview.

## File map

SAMPLE_IMAGES.md lists dated public original-image links and coverage of all six
states. Firefly_tabby_cat.jpg is bundled under the existing provenance fixtures,
with its source, upstream MIT notice (LICENSE-CAI.txt) and expected JSON. Keep
this imported example separate from the generated CC0 artwork's attribution.
Its production-anchor badge is Unknown signer with a declared AI origin; do not
add trust anchors to make it Verified. No confirmed public trusted URL is claimed.

frontend/provenance/: bytes.js (acquisition); metadata-reader.js (pure bounded
PNG/JPEG/WebP parser); c2pa-verifier.js (injectable lazy SDK adapter); c2pa-worker.js
(network-disabled packaged worker entry); declarations.js (active manifest only);
provenance-core.js (contract/classification); provenance-panel.js + provenance.css
(observer/text renderer). package.json marks these .js files as ESM for Node.

vendor/c2pa/: pristine and one-line-patched upstream builder, bundled sdk.js,
upstream worker/WASM, native WASM bindings for Node tests, licence notices,
official signer/TSA anchors, VERSION.md, SHA256SUMS.json and rebuild script.
The worker URL patch accepts only the current chrome-extension host in addition
to upstream HTTPS. The application only supplies chrome.runtime.getURL paths.

backend/tests/provenance-*.test.mjs and fixtures/provenance/: original CC0 test
artwork, public test root A, CLI/SDK reports, generator and exact mutation recipe.
Test root A is NEVER runtime trust. Default signed/untrusted fixtures both show
Unknown signer; explicit test-root injection verifies only signer A automatically.

Only original files changed: sidepanel.html (+container/CSS link/module tag) and
manifest.json (+minimum wasm-unsafe-eval CSP). Preserve their CRLF and small diff.
Do not change sidepanel.js, background.js, content.js, providers/audio, website,
backend, Telegram, .github or lowercase browser-extension. History rows have no
click behavior: intentionally excluded. #preview.src and #verdict.class are the
only existing side-panel hooks.

## Verification and remaining work

Browser_Extension/backend: npm test -> 80 total, 75 pass, 5 MML_E2E_URL skips.
Provenance subset -> 49 pass (real WASM plus recorded SDK/CLI and mocked DOM/API
tests). Browser_Extension: node --test tests/*.cjs -> 13 pass. Parity script passed.
Optional backend pytest was interrupted after producing no output for minutes;
Ruff/Mypy absent; website build missing vite/client dependencies. No broad pass
is claimed. CI provisions dependencies, but runs ONLY background.test.mjs in both
extension folders, not new provenance tests or CJS suite. Do not edit CI here.

Next: user runs TESTING.md in Chrome, records results, supplies all five issue
numbers, fills the repo PR template using PR_HANDOFF.md, and requests team review.
Merge main into the feature branch if the teammate lands first; never force-push.
Use a GitHub merge commit to preserve the viva's individual commit history.

Known limits: JPEG/PNG/WebP only; 12 deflate attempts x64 KiB and 256 KiB decoded
text budget; incomplete declaration inspection remains not_declared. URL servers
may change bytes; DNS cannot be pre-resolved safely in browser code. Offline
anchors age and revocation is not live. SDK/browser worker startup still needs
manual acceptance. Full protocol and issue acceptance are in the adjacent docs.

Manual follow-up: user confirms signed.png -> Unknown signer with declarations
in Chrome. An ordinary-JPEG bug was reproduced and fixed: the public browser
Reader.fromBlob returns null for absent credentials, unlike raw WasmReader which
throws JumbfNotFound. Exactly null now becomes no_credentials. Large-stripped.jpg
forces this SDK path. Results additionally include fixed diagnosticCode and
metadataInspected; unavailable UI hides uninspected credential fields. No raw
error messages or image URLs are exposed. Post-fix Chrome retest is pending.

## V2 continuation overrides (2026-11-22)

Active branch: feature/provenance-v2-website, based on main c8131d1. V1 above is
already merged. Current v2 status/design: STATUS.md / V2_DESIGN.md. Target SDK is
0.16.0 in both clients; the 0.17.1 age exception is withdrawn. Re-vendor/test before
claiming the installed runtime has changed. Keep the 0.17.1 trust-fetch finding
in SDK_AUDIT.md. Preserve existing CSP values; the user approved a provenance-only
network ban with the hardened-worker fallback (not a CSP guarantee). No Chrome
control. Six commits, no backend/detector edits, stop and report any breakage.
