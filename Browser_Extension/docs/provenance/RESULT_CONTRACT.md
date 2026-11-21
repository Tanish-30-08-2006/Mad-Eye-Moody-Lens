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
never as established facts. Unknown validation evidence fails closed.

## SDK 0.17.1 mapping (WASM 0.15.1)

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
| C2pa(InvalidAsset(...)) / known malformed credential errors | invalid; no invented validation code |
| Unknown SDK exception, init failure, timeout | unavailable |

Failure precedence prevents an untrusted but tampered credential from appearing
only as Unknown signer. Raw SDK codes are deduplicated, capped at 128 entries of
160 characters; exceptions are not invented as validation codes. Ingredient delta
codes are retained; signer classification comes from the active manifest. A
credential using an unrecognized binding scheme fails closed as unavailable.
