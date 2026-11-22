# Issue map and acceptance

Supply five GitHub issue numbers in the PR, not in these commits. The team leader
raises issue 1; the teammate raises issue 2; the user raises issues 3, 4 and 5.
One PR can close all five after merging into main. No issue or PR was opened here.

| Issue | Resolving commit | Automated evidence | Manual acceptance still required |
| --- | --- | --- | --- |
| 1 Verify credential signatures and integrity | 18dc4c4 — feat(provenance): C2PA verification and trust states | provenance-verifier: real WASM/CLI agreement; claimSignature.mismatch and assertion.dataHash.mismatch; offline settings | Packaged Chrome worker/WASM/CSP path; no verification network requests |
| 2 Extract image origin and editing declarations | 549e5b0 — feat(provenance): origin and edit declarations | provenance-declarations: signer/tool, exact created-action URIs, four edits, active manifest only, malicious/unknown text | Display and labelling in the side panel; neutral disagreement |
| 3 Verify bytes are the original file | 774ef0b — feat(provenance): original-byte acquisition | provenance-bytes: SHA-256 equality for data URI and mocked fetch, size/URL/timeout controls; source audit in ARCHITECTURE | Original file upload and normal-page right-click; inaccessible URL fallback |
| 4 No test fixtures | 29fdad1 — feat(provenance): metadata reader and fixtures | FIXTURES.md + per-file expected JSON, signed/untrusted/corrupt/stripped/SD/truncated files; WASM cross-check added in 18dc4c4 | Every fixture badge in TESTING.md |
| 5 Invalid or untrusted signatures need their own state | 18dc4c4 — feat(provenance): C2PA verification and trust states | recorded SDK classification, affirmative signature/binding/trust requirements, invalid precedence, distinct render badges | Unknown signer / Signature invalid remain separate from No credentials |

## Commit sequence

1. 9c7df1e docs(provenance): add design and result contract
2. 29fdad1 feat(provenance): metadata reader and fixtures
3. 774ef0b feat(provenance): original-byte acquisition
4. 18dc4c4 feat(provenance): C2PA verification and trust states
5. 549e5b0 feat(provenance): origin and edit declarations
6. cdd9202 feat(provenance): side panel UI integration (includes final parser
   browser-compatibility, compressed-input work-budget and production-trust checks)
7. docs(provenance): final docs, issue map and test guide (this documentation commit;
   find its hash with git log)

The first seven planned commits remain on feature/image-provenance-check. The sidepanel.html
integration adds three lines; the manifest adds the minimum three-line WASM CSP.
The user replaced browser automation with manual acceptance, so that CSP exception
is documented from Chrome's official policy rather than claimed browser evidence.

## Closing the issues safely

GitHub does not inspect acceptance criteria. Keep the PR draft and use Related #N
while checks are incomplete. Run the manual list, keep the automated results and
review evidence, and tick each issue's acceptance criteria. Only then add five
separate Closes #N lines and mark the PR ready for review/merge. A merge into the
default main branch closes linked issues; a feature-branch push alone does not.
After merging, open all five issues and verify the closing PR is linked. Reopen
and file a follow-up if any acceptance condition proves unmet.

## Viva talking points

1. Detection of a marker is not verification. A maintained WASM SDK validates
   signatures and file binding; official offline anchors determine trust. A valid
   credential proves a signed statement and integrity, not truth.
2. Read only the active manifest. Map exact created-action source URIs, preserve
   recorded edits, label signing time as claimed, and never infer an unseen history.
3. Verify file bytes before any canvas/model conversion. SHA-256 equality tests
   prove acquisition preservation; hashes are never a runtime evidence feature.
4. Reproducible test artwork plus disposable certificates yield real signed,
   corrupted and untrusted samples. Independent CLI reports cross-check the SDK.
5. Integrity and trust differ. Untrusted-but-intact means Unknown signer; tampered
   means Signature invalid; absence remains neutral. Detector/provenance disagree
   without either result being overwritten.

## Eighth commit: manual-test correction

fix(provenance): handle unsigned SDK reads and explain failures

This follow-up preserves the already-pushed seven commits. It resolves the
manual-test finding that an SDK null Reader (no credentials) was dereferenced and
misclassified as unavailable. It strengthens issues 1, 4 and 5 with a larger
unsigned fixture and a regression through the actual public SDK wrapper backed
by real WASM, plus safe failure-stage messages and UI tests. The test fails before
the adapter fix. No crypto code, vendor hashes, original extension files, provider
behavior, permissions or backend code change. User-confirmed Chrome success for
signed.png is recorded; the post-fix ordinary-JPEG retest remains manual.

## User-requested sample/documentation follow-up

docs(provenance): add Firefly sample and public test guide

The user requested the previously downloaded Firefly original inside the repo.
It now lives in the existing provenance fixtures folder with upstream MIT
attribution/licence and expected JSON. SAMPLE_IMAGES.md supplies verified public
links and covers all six states using public originals, deterministic local
fixtures and an explicit test-root positive case. No unconfirmed public Verified
badge is claimed. This additional commit is explicitly requested after the prior
eight commits; their history is preserved. No runtime or provider code changes.

## Planned v2 issues (not yet closed)

| Placeholder | Scope |
| --- | --- |
| ISSUE-A | Reason classification and offline trust snapshot |
| ISSUE-B | Bounded unsigned generator hints |
| ISSUE-C | Deterministic absence explanation and evidence strip |
| ISSUE-D | Contextual vendor link-outs |
| ISSUE-E | Website Origin check card |
| ISSUE-F | Exact SDK pin, lazy assets, offline worker and parity |
| ISSUE-G | Fixture matrix, tests and documentation |

The real seven issue numbers have not been supplied. Do not invent them or mark
these issues resolved. Six planned commits are listed in V2_DESIGN.md.
