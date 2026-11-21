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
| aiDeclaration | `declared_ai_generated`, `includes_ai_generated_elements`, `declared_camera_capture`, `not_declared` |
| actions | At most 20 active-manifest actions, with capped raw code and human label |
| ingredientCount | Active manifest ingredient count |
| metadataHints | At most 12 unsigned, editable/forgeable hints; values at most 240 characters |
| remoteManifestNotFetched | A remote manifest reference was found but deliberately not fetched |
| message | Fixed plain-language explanation; never a raw exception |

| status | Badge | Requirement |
| --- | --- | --- |
| verified | Verified credentials | SDK validates signature, asset binding, and signer trust |
| untrusted_signer | Unknown signer | Valid signature/binding; signer is outside the bundled trust anchors |
| invalid | Signature invalid | SDK reports invalidity: tampering, mismatched hashes, malformed signature, expired credential |
| no_credentials | No credentials found | No embedded credentials; neutral, not an authenticity claim |
| unsupported_format | Unsupported format | Outside JPEG, PNG, WebP support |
| unavailable | Unavailable | Inaccessible/oversized bytes, SDK load or runtime failure, timeout |

Verification and AI declaration are separate. A credential can validly declare AI
generation. Untrusted/invalid declarations must be presented with their status,
never as established facts. SDK code mapping will be filled from actual 0.17.1
outputs in the verification commit. Unknown validation evidence fails closed.
