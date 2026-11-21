# Architecture and decisions

Container magic is checked as binary bytes plus ASCII. In particular, PNG's
0x89 signature byte must not depend on Latin-1/Windows-1252 decoder alias behavior;
a cross-runtime decoder test protects that browser boundary.

At most 12 compressed-text inflations are attempted per file (64 KiB output per
attempt). Failed compression bombs consume this work budget too, preventing a
file with thousands of hostile chunks from repeatedly inflating on the UI thread.

## UI attachment and races

The single HTML integration adds one scoped stylesheet, one container below the
detector card, and one module tag alongside the unchanged classic script.
MutationObserver watches preview src and verdict class. Generation checks plus
AbortController prevent old byte/SDK results from rendering after switch, clear,
or teardown. No provider configuration is read or required. Re-check repeats the
same source without caching or persisting file-derived data.

The detector DOM exposes no image ID. After a new preview selection, a previous
verdict is ignored for disagreement notes until a new observed empty->verdict
cycle. A detector request that was already running before the selection cannot
create a note. This conservative behavior can suppress a note if mutations are
coalesced; it never changes the detector to invent an association. DOM-double
tests cover the observer contract; real page behavior remains on the manual list.

Rendering uses only createElement, textContent and replaceChildren. Static
classes come from enumerated statuses. No file-derived URL becomes a link or
image request. Cautions remain visible in empty, checking and completed states.

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

The hint parser supports PNG text (including bounded native deflate), TIFF EXIF
Software tags, JPEG XMP and WebP EXIF/XMP. Limits: 8 MiB input, 64 KiB per text
chunk/decompression, 256 KiB total decoded text, 4096 container steps, 128 EXIF
entries per IFD and depth 3, 12 hints of 240 characters. Ambiguous/truncated
containers return marker unknown, so the SDK will decide. No parsing exception
escapes to the caller. Generated fixtures use disposable test credentials; test
root injection is confined to tests and cannot influence runtime trust.
