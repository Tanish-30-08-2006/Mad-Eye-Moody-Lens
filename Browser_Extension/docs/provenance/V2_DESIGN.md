# Provenance v2 implementation plan

Design date: 2026-11-22. Scope: extension provenance modules/tests/docs and website
frontend only. The detector, background.js, sidepanel.js, content.js, backend,
lowercase extension and .github remain outside scope. Preserve original bytes,
existing line endings, plain-text rendering and bounded parser work. No storage,
image upload, soft binding lookup, scores, hashes or generator confirmation.

## Six commits

1. docs(provenance): v2 design, reason-code table and real-world audit
2. fix(provenance): trust and state classification plus anchor refresh
3. feat(provenance): generator hints reader
4. feat(provenance): evidence strip, absence explainer and maker links in the extension
5. feat(website): origin check engine and card
6. test/docs: fixture matrix, parity, final docs

## Reason mapping to implement (not current behavior)

SDK validation_state alone must never establish tampering. Inspect bounded active
manifest failures and require affirmative signature and file-binding success.
Ingredient diagnostics do not establish active-asset integrity by themselves.

| Evidence / reason code | Target state | Reason |
| --- | --- | --- |
| claimSignature.validated + assertion.dataHash.match + signingCredential.trusted, Trusted, no failure | verified | Trusted signer and intact file |
| Validated signature + binding match, signingCredential.untrusted, even SDK Invalid | untrusted_signer | Signer outside bundled snapshot |
| Affirmative integrity + signingCredential.expired or claimSignature.outsideValidity | untrusted_signer | Certificate validity problem; no tampering claim |
| signingCredential.invalid without affirmative integrity | unavailable | Certificate unusable; integrity not established |
| Explicitly established self-signed/test certificate | untrusted_signer if intact, otherwise unavailable | Separate certificate reason; never infer from a display name |
| Self-signed/test type not exposed by SDK | unavailable certificate detail | Certificate type not established; do not invent a cause |
| claimSignature.mismatch; assertion.dataHash.mismatch; known active hash mismatch codes | invalid | Signature/hash mismatch; do not assert intent |
| claim.malformed, claim.cbor.invalid, assertion JSON/container parse errors | unavailable | Malformed credential, separate from tampering |
| Unknown failures / missing affirmative evidence | unavailable | Incomplete or unsupported validation |
| JumbfNotFound or public Reader returns exactly null | no_credentials | No embedded credential found |
| Unsupported container | unsupported_format | Format outside supported JPEG/PNG/WebP |

Keep the six existing badges. Preserve SDK codes separately from fixed application
reason labels. No generic Invalid->Signature invalid shortcut. Exact code coverage
and raw-WASM injected-root verification are required in commit 2.

## Unsigned hints and presentation

Read bounded IPTC DigitalSourceType, AI System Used/Version Used, XMP CreatorTool,
EXIF Software, SD parameters, ComfyUI prompt/workflow presence, NovelAI and
Midjourney markers. Retain no prompt text: report marker existence only. Use a
small fixed family table, truncate unknown tool strings, and label all hints
unsigned, can be forged. TC260 remains excluded unless its exact key is verified.

Four evidence labels: Signed credentials, Declared in metadata, Hint only,
Nothing found. They do not form a probability or alter the detector result.
Absence explanations use deterministic type/marker facts and, only in the
extension, reviewed dated source-host facts. Unsupported/unavailable is not
absence. Prefer the original download; screenshots/re-encoding may lose metadata.
Contextual OpenAI/Google links open vendor pages with noopener/noreferrer and no
automatic image transfer. The user uploads there separately. No local SynthID
reader or confirmed-generator claim is added.

## SDK, privacy and website

Both clients target official @contentauth/c2pa-web 0.16.0 / utilities 0.4.0, exact
registry integrity. The 0.17.1 age exception is withdrawn; SDK_AUDIT.md preserves
the trust-fetch reason for repinning. Reproduce the minimal extension worker URL
patch, record hashes/licenses, refresh offline official trust anchors and retain
real WASM/c2patool agreement. Verify C2PA 2.x parsing before relying on the repin.

Preserve all existing CSP values and detector connections. The user permits a
hardened dedicated worker fallback: neutralize fetch, XHR, WebSocket, importScripts
and sendBeacon before SDK load. This is defence in depth, not a CSP guarantee.
Use explicit offline settings, read back their effective serialization, and prove
zero verification network calls with failing spies in parent and actual worker.
Test remote-manifest, unknown-signer and expired-certificate files in both clients.
Packaged resource startup is separate from verification; detector requests and
original-image downloads must keep working and have regression tests.

Website: lazy import the whole card/engine, use Vite WASM/worker asset URLs, exact
SDK lock integrity, original File bytes, no persistence, cancellation/generation
checks. Copy documented pure reader/declarations/classifier logic and enforce
JSON fixture parity. Match existing result/tag/button CSS, support mobile,
keyboard/reduced motion, and degrade safely on unavailable WASM. No site-wide CSP
change. The existing site has CSS classes, not reusable generic Card/Badge React
components; reuse the existing classes instead of inventing a component library.

## Acceptance and real-world limits

Real local ChatGPT/Gemini originals were absent at audit. Do not claim their
compatibility. Create a gitignored optional folder and clean-skipping tests.
Matrix: injected trusted root, untrusted, self-signed, malformed, signature/hash
mismatch, stripped/re-encoded JPEG/WebP, each hint, hostile text/chunks and races.
No Chrome automation: manual acceptance remains the user's task after delivery.
Baseline and per-commit evidence are in TESTING.md and STATUS.md.
