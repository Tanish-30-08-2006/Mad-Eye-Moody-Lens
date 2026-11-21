# Architecture and decisions

## Verified repository facts

The active extension is `Browser_Extension/`; the lowercase copy is excluded.
`backend/background.js` is a module service worker. `frontend/sidepanel.js` is a
classic script. `setImage()` assigns `#preview.src`; upload, URL/drop, and
`pendingReviewImage` right-click flows call it. Clear removes the attribute.
`#verdict` classes are `empty`, `ai`, `real`, or `uncertain`. History rows have no
click handler: history support is deliberately excluded.

## Data flow

`#preview.src` -> MutationObserver -> bytes.js -> metadata-reader.js -> lazy
c2pa-verifier.js -> provenance-core.js -> declarations.js -> provenance-panel.js.
The verdict observer only updates a neutral disagreement note. Neither observer
changes the detector, scores, providers, storage, or reports. A generation counter
and abort signal discard obsolete selections.

All new runtime modules live in `frontend/provenance/`. The side panel is an
extension page capable of hosting a dedicated worker and WASM; the service worker
has a different lifecycle and is intentionally untouched. Metadata parsing is pure
and bounded. The SDK remains the only signature and asset-binding authority.

## SDK decision

Use `@contentauth/c2pa-web@0.17.1`, the maintained browser package from
[c2pa-js](https://opensource.contentauthenticity.org/docs/c2pa-js/packages/c2pa-web/).
`createC2pa({wasmSrc, workerSrc})` supports a packaged worker, but this version's
worker validation accepts only HTTPS. Preserve its pristine built file and apply
a documented, narrowly scoped same-extension URL patch. Vendor all runtime code,
WASM, licences, and dated official trust anchors. No CDN or runtime trust download.

Chrome's default policy disables WASM, per its
[manifest documentation](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy).
The minimum extension-page policy is `script-src 'self' 'wasm-unsafe-eval';
object-src 'self';`. This is the one documented manifest exception. The user
replaced browser automation with a manual checklist; no Chrome run is claimed.

## Original bytes and loss boundaries

`loadImageBlob()` returns `response.blob()` or directly base64-decodes a data URI;
MIME-only `Blob.slice()` changes no bytes. `readFile()` reads the File using
`FileReader.readAsDataURL()`. Neither path re-encodes. The new path reads preview
references independently and never calls a provider conversion routine.

Known lossy image paths: `prepareZeroTrueImageBlob()` rasterizes formats other than
JPEG/PNG to JPEG (maximum dimension 2560, quality 0.92); `content.js` automatic
scan fallback uses a canvas JPEG (maximum width 1280, quality 0.9). They strip
credentials in detector inputs, but the side panel uses the original reference.
If a user supplies an already converted/recompressed file, the removed credentials
cannot be recovered. A URL may serve different bytes over time; uploading the
original file gives the strongest acquisition guarantee.
