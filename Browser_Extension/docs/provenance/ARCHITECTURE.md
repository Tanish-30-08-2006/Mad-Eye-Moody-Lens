# Architecture and decisions

## Browser SDK absence handling (manual-test follow-up)

The raw WasmReader throws C2pa(JumbfNotFound) for unsigned files. The public
browser Reader.fromBlob catches that and returns null in SDK 0.17.1 (see the
pristine/patched upstream Reader and J helper). The adapter must treat exactly
null as no_credentials before calling manifestStore. The initial adapter missed
this contract difference; ordinary JPEGs deferred to the SDK displayed unavailable.
A new 13 KiB unsigned JPEG and a regression through the actual public Reader,
using real WASM behind the worker-RPC test double, reproduce and protect the fix.

File acquisition, SDK loading, trust resource loading, initialization, reading and
timeout failures have separate fixed diagnostic messages. An unavailable result
does not establish absent signer/actions/ingredients. Metadata inspection has its
own flag, so acquired unsigned hints can still display if credential verification
fails, while unread metadata is labelled not inspected. No raw errors are surfaced.

## Production image-byte loss audit

The source audit excluded the explicitly stale lowercase copy, tests, generated
vendor code and training notebooks. These production derivatives do not feed the
new original-image acquisition path:

| Source | Transformation / why provenance is unaffected |
| --- | --- |
| Browser_Extension/backend/background.js, prepareZeroTrueImageBlob | Non-JPEG/PNG formats become JPEG, max dimension 2560, quality 0.92. Only detector input changes; provenance fetches the preview's original reference independently. |
| Browser_Extension/frontend/content.js, scan fallback | Canvas JPEG, max width 1280, quality 0.9, strips file credentials. It is an automatic detector input; right-click pendingReviewImage uses the source URL. |
| Browser_Extension/frontend/sidepanel.js, video frame extraction | Canvas JPEG frames, max width 1280, quality 0.88. Video input uses separate DOM/state, not the image preview. |
| functional-ui-models-backend/backend/app/services/pipelines.py | run_image decodes to PIL RGB; heatmap_to_png creates a new grayscale PNG. Neither is read by this local file feature. |
| functional-ui-models-backend/backend/app/preprocessing/faces.py; app/detectors/{image,face,video,stub}.py | Face crops, model resize/normalization and decoded video frames operate on pixels. These are model inputs/derivatives; the side panel never verifies them as the original file. |
| functional-ui-models-backend/frontend/src/components/HeatmapPanel.tsx | Crops/tints/overlays canvas pixels and exports PNG heatmap tiles. No source credentials survive in those derivatives; they are outside the preview-byte path. |

Preserving paths: background loadImageBlob returns response.blob or raw base64
bytes. Side-panel readFile and website externalProvider readAsDataURL encode the
original file bytes without rasterizing. Telegram's bot forwards its downloaded
bytearray, and Reddit's optional pHash reads pixels without rewriting the upload;
neither participates in this local feature. If any platform or user supplies an
already recompressed photo/heatmap/frame/screenshot, credentials lost upstream
cannot be restored and absence must remain neutral. There is no claim that a
URL response is identical to a server's historical/original upload.

## Runtime cost and lifecycle

No runtime hash cache is used. Each credential-bearing/ambiguous check lazily
loads the SDK and starts a dedicated packaged worker; disposal drops its file and
manifest state after the check. Clear/switch aborts and invalidates the generation.
Startup/verification has a 15-second result timeout; an SDK initialization handle
that arrives after abandonment is immediately disposed. A browser-startup failure
that never produces a handle remains a manual integration concern. Unsigned files
with clearly absent markers avoid WASM. Bounded JPEG scanning may conservatively
defer large entropy-coded files to the SDK even without credentials.

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

## V2 design approved 2026-11-22 (pending implementation)

See V2_DESIGN.md and SDK_AUDIT.md. The target SDK is 0.16.0 in both clients.
The user explicitly scoped the no-network requirement to provenance and forbids
changing existing CSP values or detector connections. A dedicated worker must
neutralize network APIs before SDK load; this is not a CSP guarantee. Pure
website logic will be a documented copy protected by JSON fixture parity.

V2 hint inspection no longer returns a whole XML/JSON payload or prompt chunks.
It extracts bounded named scalar fields or fixed marker-presence messages and
small family-table matches. Existing parser byte/chunk/inflation limits remain.

V2 evidence.js provides pure presentation facts. Evidence is categorical, never
a percentage and never merged with detector scores. The dated source-host list
contains only imagedelivery.net (2026-11-22). Cloudflare documents automatic
transcoding of delivery variants and metadata filtering defaults:
https://developers.cloudflare.com/images/manage-images/serve-images/serve-uploaded-images/
https://developers.cloudflare.com/images/transform-images/transform-via-url/
The host note is a possibility, never a claim that this file was transformed.
Vendor URLs are fixed constants with noopener/noreferrer, no image/query/hash
arguments. SynthID is not read locally. Existing extension UI hooks are unchanged.
