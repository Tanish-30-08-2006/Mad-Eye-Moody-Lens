# Security and privacy

The manifest exception is exactly the minimum documented WASM extension-page
policy. It permits local WASM compilation; it adds no remote script, eval,
blob-worker source, host permission or web-accessible resource. The same-extension
worker URL patch is documented with pristine/patched source and hashes in
vendor/c2pa/VERSION.md. Actual Chrome enforcement is pending the user's checklist.

Trust is relative to the official signer/TSA PEM snapshot dated 2026-11-21.
Revocation is not fetched live, and a snapshot can age. This is not an identity,
truth, legal-evidence, or ownership guarantee. File size/bounds/timeouts limit
work; browser code cannot pre-resolve public DNS or recover stripped credentials.

Verification is local. No Moody Lens backend, detector, analytics, trust-list,
OCSP, remote-manifest, thumbnail, ingredient, or icon download is permitted by the
new verification flow. Only initial public image URL acquisition and packaged
extension resources may be fetched. "No network during verification" excludes
that explicit URL acquisition and pre-existing detector requests.

Use the existing public-host exclusions, plus defensive URL checks, in an isolated
copy in bytes.js. Omit credentials, disable cache, set time/size limits, and do not
request any permission. Failed URL reads suggest uploading the original file.
Browser code cannot resolve DNS safely in advance: this limitation must be stated.

bytes.js rejects redirects entirely (including public-to-private redirects),
userinfo URLs, encoded private IP forms normalized by URL, local hostnames,
private/link-local/multicast/documentation IP ranges, and single-label names.
It never requests host permissions. A public DNS name can still resolve to a
private address; this browser-only limitation cannot be eliminated without a
trusted DNS/network boundary. Timeouts cover both headers and body reads, and
the stream is cancelled as soon as the 8 MiB cap is exceeded.

No images, metadata, prompts, hashes, or manifests are persisted, logged, exported,
or written to chrome.storage. Hashes, if used, are only ephemeral cache keys.
File-derived text is rendered with textContent, never innerHTML. Bound input,
chunks, decompression, EXIF traversal, actions, and text lengths. Never treat an
unsigned metadata hint as evidence of a valid signature.

Use the SDK's signature validation. Do not substitute marker detection for
verification. The marker check skips WASM only when absence is clear; ambiguous
or malformed containers must reach the authoritative SDK. Trust is relative to
a dated snapshot, not a statement about truth or current revocation status.

Always show: A valid signature does not prove the content is true. Missing
credentials do not prove authenticity. Unsigned metadata can be edited or forged.
