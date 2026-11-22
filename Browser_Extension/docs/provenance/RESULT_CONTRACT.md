# Result contract (schemaVersion 1)

JSON-compatible results have no image, hash, prompt archive, or raw manifest.
They are ephemeral in-memory display data. Detector scores never enter this
contract. All text is untrusted and length-capped before display.

| Field | Meaning |
| --- | --- |
| schemaVersion | Integer `1` |
| status | One of the six states below |
| signatureStatus | `valid`, `invalid`, `absent`, or `unknown` |
| signerTrust | `trusted`, `untrusted`, or `unknown` |
| reasons | SDK validation codes, preserved verbatim (bounded count/length) |
| signer | Active manifest signature issuer/common name, or null |
| claimGenerator | Active manifest generator, or null |
| claimedSigningTime | Active manifest reported signing time, or null; labelled claimed |
| claimedDigitalSourceType | Exact created-action source URI, capped, or null if absent/ambiguous |
| aiDeclaration | `declared_ai_generated`, `includes_ai_generated_elements`, `declared_camera_capture`, `not_declared` |
| actions | At most 20 active-manifest actions, with capped raw code and human label |
| actionsTruncated | More actions exist, or bounded inspection was incomplete |
| ingredientCount | Active manifest ingredient count |
| metadataHints | At most 12 unsigned, editable/forgeable hints; values at most 240 characters |
| metadataInspected | Boolean: the bounded metadata parser actually ran on acquired bytes |
| diagnosticCode | Null or a fixed application failure code, separate from SDK reasons |
| remoteManifestNotFetched | A remote manifest reference was found but deliberately not fetched |
| message | Fixed plain-language explanation; never a raw exception |

| status | Badge | Requirement |
| --- | --- | --- |
| verified | Verified credentials | SDK validates signature, asset binding, and signer trust |
| untrusted_signer | Unknown signer | Valid signature/binding; signer is outside the bundled trust anchors |
| invalid | Signature invalid | SDK reports signature or signed-content hash mismatch; not generic certificate/parser failure |
| no_credentials | No credentials found | No embedded credentials; neutral, not an authenticity claim |
| unsupported_format | Unsupported format | Outside JPEG, PNG, WebP support |
| unavailable | Unavailable | Inaccessible/oversized bytes, SDK load or runtime failure, timeout |

Verification and AI declaration are separate. A credential can validly declare AI
generation. Untrusted/invalid declarations must be presented with their status,
never as established facts. Unknown validation evidence fails closed.

## Historical v1 SDK 0.17.1 mapping (superseded by v2 below)

Read `validation_state` plus `validation_results.activeManifest` (success,
informational, failure). The SDK is authoritative; this code only classifies its
report. The exact spellings below occur in the pinned SDK. CLI 0.29.0 and real
vendored WASM outputs are recorded with the fixtures and cross-checked by tests.

| Evidence / code | Classification |
| --- | --- |
| Trusted + claimSignature.validated + assertion.dataHash.match + signingCredential.trusted, no active failures | verified |
| Valid + validated signature + matching data hash + signingCredential.untrusted | untrusted_signer |
| Invalid, claimSignature.mismatch or assertion.dataHash.mismatch | invalid |
| signingCredential.expired, claimSignature.outsideValidity, signingCredential.invalid, other active failures | invalid |
| claimSignature.insideValidity | Kept in reasons; insufficient by itself |
| assertion.hashedURI.match | Kept in reasons; insufficient for file binding |
| signingCredential.ocsp.skipped | Informational; offline revocation limitation |
| No active manifest/validation report or missing affirmative evidence | unavailable |
| C2pa(JumbfNotFound) SDK exception | no_credentials |
| Public browser Reader.fromBlob returns null | no_credentials (same absence condition; must not dereference null) |
| C2pa(InvalidAsset(...)) / known malformed credential errors | invalid; no invented validation code |
| Unknown SDK exception, init failure, timeout | unavailable |

Failure precedence prevents an untrusted but tampered credential from appearing
only as Unknown signer. Raw SDK codes are deduplicated, capped at 128 entries of
160 characters; exceptions are not invented as validation codes. Ingredient delta
codes are retained; signer classification comes from the active manifest. A
credential using an unrecognized binding scheme fails closed as unavailable.

For unavailable results, diagnosticCode distinguishes bytes_unavailable,
source_rejected, size_limit_exceeded, sdk_load_failed, trust_anchors_unavailable,
sdk_initialization_failed, verifier_timeout, verification_failed,
validation_incomplete, check_cancelled and check_failed. These are application
diagnostics, never invented SDK validation codes. Each maps to a fixed safe
message; raw exceptions/URLs/prompts are never displayed or logged. Failed reads
must not display empty credential fields as if absence had been established.
These additive fields retain schemaVersion 1 and do not alter detector contracts.

## Declaration mapping

Only active-manifest c2pa.actions / c2pa.actions.vN assertions are examined. The
created action's digitalSourceType uses exact HTTP URIs under
`http://cv.iptc.org/newscodes/digitalsourcetype/`, confirmed against the
[IPTC vocabulary](https://cv.iptc.org/newscodes/digitalsourcetype/) and pinned SDK
DigitalSourceType types:

| URI suffix | aiDeclaration |
| --- | --- |
| trainedAlgorithmicMedia | declared_ai_generated |
| compositeWithTrainedAlgorithmicMedia | includes_ai_generated_elements |
| digitalCapture or computationalCapture | declared_camera_capture |
| Other, absent, contradictory, or incomplete | not_declared |

No matching by URL suffix, tool name, ingredient, or edited action. computationalCapture
is real-world multi-frame capture with processing per IPTC, not a promise that
the content has never been edited. signature_info.time is reported as claimed
signing time; action.when is not a signing time. All declarations are shown as
credential statements, including on invalid/untrusted credentials, with their
verification status kept visible.

## V2 unsigned hint additions

metadataHints optionally includes family (fixed string or null) and declared
(boolean for a named unsigned declaration field). Both remain unsigned and
forgeable; neither changes aiDeclaration, credential status or detector results.
SD/ComfyUI prompt/workflow values contain presence messages, never prompt text.
AI system/version keys follow the [IPTC 2025.1 specification](https://www.iptc.org/std/photometadata/specification/IPTC-PhotoMetadata-2025.1.html).
TC260 keys are not guessed. A family name is a metadata lead, not generator proof.

## Current v2 classifier (SDK 0.16.0 / WASM 0.14.0)

status is still one of the six original states. reasonCode/reason are fixed
application explanations, separate from bounded raw SDK reasons. certificateType
is not_established when the SDK does not expose enough detail; never infer
self-signed/test status from issuer text. format comes from byte inspection;
reencodedPlatform is a fixed reviewed host label in the extension only.

| Evidence | State / reason |
| --- | --- |
| Trusted, affirmative signature/binding/trust, no failures | verified |
| Affirmative signature/binding + trust-only failures, even SDK Invalid | untrusted_signer |
| Certificate expiry without affirmative integrity | unavailable / certificate_expired |
| Unusable/revoked certificate | untrusted_signer if integrity established, otherwise unavailable |
| Known active signature or hash mismatch | invalid / integrity_mismatch |
| Malformed container/claim/assertion | unavailable / malformed_manifest |
| Unknown active failures or incomplete validation | unavailable / validation_incomplete |
| Clear absent markers / null Reader / JumbfNotFound | no_credentials |
| Remote-only SDK refusal | unavailable / remote_manifest_not_fetched; no fetch |
| Clear absent embedded markers plus remote XMP link | no_credentials; remoteManifestNotFetched true |

Evidence strip is categorical. Unsigned declarations/hints never promote a
credential state. Both parent/worker network spies and JSON parity are required.
