# Image provenance and website Origin check

The extension reads the selected image in **Provenance (file credentials)**; the
website runs **Origin check** after choosing an image, before detector submission.
Both read original bytes locally and remain independent of detector/API failure.
The website card is lazy-loaded and uses the site's existing result/tag styles.

Official @contentauth/c2pa-web 0.16.0, offline C2PA signer/TSA snapshots and a
hardened dedicated worker are used in both clients. Existing CSP values and
detector connections are unchanged. The worker fallback is defence in depth,
not a CSP guarantee. No provenance data is stored, logged or exported.

A valid signature establishes a signed statement/integrity, not truth. Missing
credentials prove nothing. Unsigned metadata can be forged. Generator families
are hints, not confirmed authorship. Prompt/workflow contents are not retained;
SynthID is not read locally. Vendor links open a separate site for your upload.

Supported credential containers: JPEG, PNG, WebP, up to 8 MiB. Other formats are
unsupported, not authentic. A remote manifest is never downloaded. Malformed,
expired and untrusted certificates have explanations separate from tampering.
Self-signed/test type is not guessed when the SDK cannot establish it.

Start with [signed.png](../../backend/tests/fixtures/provenance/signed.png),
[Firefly sample](../../backend/tests/fixtures/provenance/Firefly_tabby_cat.jpg),
[expired sample](../../backend/tests/fixtures/provenance/expired-chatgpt.png), or
re-encoded/stripped examples in that folder. Expect Unknown signer for signed
test/Firefly files; no production root is added to manufacture a green badge.

See [STATUS](STATUS.md), [TESTING](TESTING.md), [SDK_AUDIT](SDK_AUDIT.md),
[ARCHITECTURE](ARCHITECTURE.md), [RESULT_CONTRACT](RESULT_CONTRACT.md),
[ISSUES_MAP](ISSUES_MAP.md), [PR_HANDOFF](PR_HANDOFF.md), and
[website guide](../../../functional-ui-models-backend/frontend/PROVENANCE.md).
The optional backend/tests/fixtures/real-world folder is gitignored. No local
ChatGPT/Gemini originals were supplied; their compatibility is unverified.
Native Chrome acceptance remains manual. No browser automation was used.
