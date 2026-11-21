# Security and privacy

Verification is local. No Moody Lens backend, detector, analytics, trust-list,
OCSP, remote-manifest, thumbnail, ingredient, or icon download is permitted by the
new verification flow. Only initial public image URL acquisition and packaged
extension resources may be fetched. "No network during verification" excludes
that explicit URL acquisition and pre-existing detector requests.

Use the existing public-host exclusions, plus defensive URL checks, in an isolated
copy in bytes.js. Omit credentials, disable cache, set time/size limits, and do not
request any permission. Failed URL reads suggest uploading the original file.
Browser code cannot resolve DNS safely in advance: this limitation must be stated.

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
