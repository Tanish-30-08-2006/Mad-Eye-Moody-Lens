# Browser-only Origin check

Select an image in Analyse a file. Origin check runs on that File's original
bytes before detector submission and remains independent of provider failures.
Run locally with npm ci then npm run dev; no backend is needed for this card.
Use npm test, npm run typecheck and npm run build for automated checks.

Both clients use official @contentauth/c2pa-web 0.16.0 / utilities 0.4.0 with
exact lockfile integrity. scripts/vendor-provenance.mjs checks the pin and official
chunk hash and rebuilds src/provenance/vendor/sdk.js. Run npm run vendor:provenance
after an explicit SDK review. Website SDK code has no worker-URL patch: a small
reader-only adapter reuses the SDK's existing highgain protocol and public
Reader/Context. SDK parsing/cryptography is unchanged. Licenses are preserved in
the source and emitted bundle banner; vendor/VERSION.json records hashes.

## Loading and network boundary

The card/CSS are dynamically imported after image selection. The SDK, trust text,
WASM and ES worker are separate lazy resources; clearly unsigned files skip WASM.
WASM uses the pinned npm resource ?url; the worker uses Vite ?worker&url. Vite's
worker output format is ES. No nginx, manifest CSP or site-wide CSP value changes.
The website fetches only its own WASM asset during resource setup, then compiles
it inside the guarded external worker rather than on the main thread. Timestamp
and manifest roots are separate inline offline PEM snapshots. No image is sent
in a request. The worker replaces fetch/XHR/WebSocket/importScripts/sendBeacon
before importing official SDK code. This is defence in depth, not a CSP guarantee.
Worker startup is bounded and initialization messages are queued during import.
Native browser/CSP/layout checks are still manual; startup failure displays a
short Unavailable message instead of changing the detector.

Effective SDK settings and parent/worker failing spies are tested with a real
remote-only manifest file, unknown signer and expired public CAI example. The
Node harness supplies browser message/FileReaderSync APIs but real SDK/WASM.
It also forbids parent WASM compilation in the website test. Packaged-resource
startup is outside the no-network file-verification phase.

## Pure copy contract

These files are documented copies of Browser_Extension/frontend/provenance/:
bytes.js, metadata-reader.js, declarations.js, provenance-core.js, evidence.js,
offline-settings.js and worker-network.js. After any change, copy the same file
and run npm test. provenance-parity.test.mjs checks byte equality plus identical
JSON for reader, declarations, classifier and complete checks over every fixture.
verifier-adapter.js is the thin extension adapter with its local SDK import path
adapted; browser-resources.js supplies browser asset loading. No backend changes.

The card uses the site's existing result/verdict-chip/tag design classes and
colors, 2px radii and mono metadata font. All file text is plain React text and
truncated. Selection generations/abort signals suppress obsolete results. Nothing
is saved to history, storage, logs, or reports by this feature. The website uses
only file-type absence facts; it never adds extension source-host explanations.
SynthID is not read locally. Vendor links require a separate upload on that site.

## Manual checks

Use signed.png, untrusted.png, corrupted-signature.png, binding-mismatch.png,
truncated.png, stripped.jpg, remote-manifest.jpg and expired-chatgpt.png under the
extension provenance fixture folder. Try original ChatGPT/Gemini downloads, a
re-saved WebP and screenshot; those user originals were not available to the
agent, so their compatibility remains unverified. Check rapid replacements,
clear/media-tab changes, keyboard focus, narrow screens, detector-down behavior
and DevTools worker/WASM errors. Watch Network while selecting a local image:
only same-origin feature resources may load; no image upload occurs until the
separate detector button is clicked. No browser automation was used.
