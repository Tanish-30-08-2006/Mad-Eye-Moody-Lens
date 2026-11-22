# Provenance v2 PR handoff

Title: **feat(provenance): real-world AI origin hints and website origin check**
Base main; compare feature/provenance-v2-website. Base commit c8131d1 already
contains v1. Push only the feature branch. No PR was opened by the agent.

## Description

Adds an independent local Origin check beside the website detector and extends
the extension's file-credentials panel. Both use official C2PA SDK 0.16.0, offline
trust anchors and original bytes. Trust-only failures remain Unknown signer when
integrity validates; malformed/expired/unreadable credentials have separate
reasons. Only signature/hash mismatches get Signature invalid.

Unsigned IPTC/tool/generator hints are bounded and forgeable; prompt/workflow
contents are not retained. Evidence is categorical, never a percentage or merged
with the detector score. Missing credentials are neutral. Fixed OpenAI/Google
links require a separate vendor-side upload. No local SynthID detection or
confirmed-generator claim.

## Components

- [x] Chrome Browser Extension
- [x] Website
- [ ] Backend API
- [ ] Reddit Extension / Telegram Bot
- [ ] Deployment / CI changes

## Validation checklist

- [x] Existing extension/provider/website regression suites retained
- [x] Real WASM and fresh c2patool 0.29.0 agree in 12 combinations
- [x] C2PA 2.4.0 parsing, injected trusted root and self-signed fixture
- [x] Parent/actual-worker failing network spies and effective settings in both clients
- [x] Website states, escaping, original-byte and switching tests; JSON/copy parity
- [x] Website production build/typecheck and HTTP-only lazy-resource smoke
- [x] No existing manifest/CSP value or detector connection changes
- [ ] Full CI, including backend pytest
- [ ] Native Chrome manual acceptance, narrow layout and CSP enforcement
- [ ] User-supplied ChatGPT/Gemini originals (none were present)

Use the final command counts in TESTING.md. Backend dependency installation failed;
one bounded pytest attempt could not import pytest. Website lint, Ruff and Mypy
were not run, as accepted. Do not tick these as passed.

## SDK decision and achieved isolation

The approved pin is 0.16.0 in both clients, with exact website lock integrity and
vendored hashes. The 0.17.1 age exception is WITHDRAWN. Utilities 0.5.2's added
fetchTrustSetting/executeTrustFetch and tsaTrust URL-resolution branch are absent
from 0.4.0; retain the evidence in SDK_AUDIT.md as the reason for repinning.
0.16.0 still has basic URL fetching. The adapter rejects trust URLs, disables
OCSP/remote manifests, supplies a failing trust fetch callback, and keeps timestamp
roots separate through native trust.anchors serialization. Trust validation
stays enabled. Never silently move back to 0.17.1.

Achieved approach: approved dedicated-worker fallback, **defence in depth, not a
CSP guarantee**. fetch/XHR/WebSocket/importScripts/sendBeacon are replaced before
SDK import, and startup messages are queued. Website WASM compiles in the guarded
worker, using the official SDK's existing highgain protocol and public Reader.
Packaged/same-origin resource startup is separate from verification. The sandbox
approach was not achieved or claimed. Existing CSP values are unchanged, and
manifest.json was not edited. Node's browser-API bridge runs real SDK/WASM but is
not native Chrome enforcement evidence.

Self-signed/test type is not inferred from issuer display names. The fixture's
self-signature is independently checked; arbitrary-file certificate type remains
not established when the SDK does not expose it. TC260 exact key was not verified
and is omitted. Real user-original compatibility remains unverified.

## Issue linkage

Real issue numbers are still missing. Replace each NN after manual/CI acceptance;
do not paste these placeholders as actual issue closures or mark incomplete work
ready for merge. Use Related #N while acceptance remains pending.

```text
Closes #NN  <!-- ISSUE-A: classifier/trust -->
Closes #NN  <!-- ISSUE-B: unsigned hints -->
Closes #NN  <!-- ISSUE-C: absence/evidence -->
Closes #NN  <!-- ISSUE-D: maker links -->
Closes #NN  <!-- ISSUE-E: website card -->
Closes #NN  <!-- ISSUE-F: assets/offline/parity -->
Closes #NN  <!-- ISSUE-G: matrix/tests/docs -->
```

Reviewers: team lead for trust/privacy; Ruturaj for declarations/integration.
Merge using **Create a merge commit**. If main moves, merge origin/main into this
branch, rerun checks and push normally; do not rebase or force-push. Likely
conflicts: frontend package/lock, Analyser.tsx, App.tsx and provenance copies/vendor
or documentation files. No manifest/sidepanel/background conflict was introduced
with Vedant's files; preserve all teammate edits during any merge.

Manual extension/website checklist is in TESTING.md. Public fixture attribution
and reproduction are in backend/tests/fixtures/provenance/FIXTURES.md.
