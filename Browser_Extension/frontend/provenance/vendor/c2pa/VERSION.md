# Vendored C2PA runtime

Snapshot/re-vendor date: 2026-11-22. Package: **@contentauth/c2pa-web 0.16.0**, MIT.
Source: https://registry.npmjs.org/@contentauth/c2pa-web/-/c2pa-web-0.16.0.tgz
Project: https://github.com/contentauth/c2pa-js

Registry integrity (download independently matched):
`sha512-FEvdoYxejhSMtQ0Z0EwUM2S+6StjAWGcLHMi8eqFvzkXIKwW/2f/A+N8HRsTno8RPj8oNx1g5GFBjPw3uSQPzQ==`

Published 2026-11-04 22:14:21.918 UTC, over two weeks before this re-vendor.
The former 0.17.1 age exception is WITHDRAWN. The new trust-fetch code found in
its utilities dependency is the reason for repinning; preserve that finding in
[SDK_AUDIT.md](../../../../docs/provenance/SDK_AUDIT.md). Never silently return
to 0.17.1. Both the website package and its lockfile pin exactly 0.16.0 with the
same registry integrity; the website card is not yet implemented in commit 2.

## Dependencies and licenses

Runtime: @contentauth/c2pa-wasm 0.14.0 and @contentauth/c2pa-utilities 0.4.0
(MIT), highgain 0.1.0 and ts-deepmerge 8.0.0 (ISC). Types: c2pa-types 0.7.8.
Build tool esbuild 0.25.12 is not shipped as runtime. Preserve upstream MIT
notices. highgain and ts-deepmerge npm packages declare ISC/author but omit
license files; LICENSE-highgain and LICENSE-deepmerge provide standard ISC
notices with those author attributions, not claimed verbatim upstream files.

## Minimal same-extension worker URL patch

The official 0.16.0 chunk is dist/c2pa-CqMzdYCb.js; its pristine bytes are saved
as builder.upstream.js. The one-line patch in builder.patched.js/worker-url.patch
accepts chrome-extension: only from the same running extension host/context.
HTTPS behavior remains unchanged. Foreign-extension, HTTP, blob and file URLs
remain rejected. SDK crypto/parsing algorithms are not patched. vendor.mjs
checks the exact package version and reproduces the ESM bundle using esbuild.

```diff
-  if (n.protocol !== "https:")
+  if (n.protocol !== "https:" && !(n.protocol === "chrome-extension:" && globalThis.location?.protocol === "chrome-extension:" && n.host === globalThis.location.host))
```

c2pa_worker.js, c2pa_bg.wasm and wasm-bindings.js are unmodified official files.
Rebuild in a temporary exact-version install with scripts disabled, supplying
the two official PEMs and their CC BY 4.0 license, then run vendor.mjs TEMP.

## Offline trust refresh

Refetched 2026-11-22 from official c2pa-org/conformance-public at commit
f61352d703c756f4caa176ce3cbccc41a085c11a. All 36 signer and 24 timestamp
certificates parsed. Both snapshots are byte-identical to the prior download.
These cover that repository's C2PA signer and TSA trust lists, not every signer,
live revocation, every legacy/private list, or all generators. Attribution: C2PA;
LICENSE-trust-list retains CC BY 4.0. No test root is installed in runtime trust.

- https://github.com/c2pa-org/conformance-public/tree/f61352d703c756f4caa176ce3cbccc41a085c11a/trust-list

## Offline enforcement and limitations

Existing manifest CSP values and detector connections are unchanged, per the
user's explicit scope approval. Achieved approach: dedicated hardened worker,
not a sandbox/CSP guarantee. It replaces fetch, XMLHttpRequest, WebSocket,
importScripts and navigator.sendBeacon BEFORE dynamically loading SDK code.
This is defence in depth. All counters retain API names/counts only, never URLs.
Packaged/same-origin JS/WASM/PEM resource loading precedes file verification.

SDK verify.remote_manifest_fetch and verify.ocsp_fetch are explicitly false.
Manifest/timestamp trust verification stays true: verification is not fetching.
There is no separate SDK trust-resource-fetch boolean in utilities 0.4.0.
createOfflineContext rejects URL inputs and supplies an always-failing fetch
callback with zero retries. OFFLINE_POLICY explicitly disables trust-list and
timestamp trust fetching. Utilities 0.4.0 lacks the tsaTrust convenience mapping,
so the adapter serializes a native trust.anchors entry tagged tsa, separate from
manifest roots. Actual WASM accepts this shape; effective-settings tests inspect
all flags and both stores. No trust checks are disabled to manufacture a badge.

Actual production worker+SDK+WASM passed failing-spy checks for a remote-only
manifest (explicit RemoteManifestUrl refusal), an unknown signer, and an expired
certificate. The Node test bridge supplies browser message transport and native
FileReaderSync semantics from original Blob bytes; it does not mock cryptography.
Parent and worker network API calls during verification: zero. The worker spies
are separately probed to prove they fail when invoked. Native Chrome remains a
manual acceptance check, not a claimed result. Website repetition is pending.

Existing provenance suite and all eight recorded c2patool agreement combinations
passed after repinning; existing fixtures parse as C2PA 2.4.0. No local ChatGPT or
Gemini originals were present. Their compatibility remains UNVERIFIED. The CAI
ChatGPT gallery example is only an attributed expired-certificate regression.

## SHA-256 file hashes

These are vendored-software hashes, never runtime user-image evidence hashes.

| File | SHA-256 |
| --- | --- |
| builder.upstream.js | `0f11d6d2e81f5c7242088022ba772268328ab668db26570ee215a744c435c404` |
| builder.patched.js | `9d3b9dc73eacd0359ed077acda9e2905b4398450685329ad8b52def8cf03366d` |
| worker-url.patch | `dffc0303f951ced2740444d712b82511e4a39a67a226909e049ec68f26cf05cb` |
| sdk.js | `4c7bea19a33d9904c2262202219afc139168c0056180d945c90f13c0f925f583` |
| LICENSE-deepmerge | `3d2643fbc36875c6a00263bc8ec6f900d7ccda5a115f4fc4a78233c717ce4a7e` |
| c2pa_worker.js | `e6874ae8682ed57d9e375d43e583afcf23afef7c92ed281556a2474ab71bdfa8` |
| c2pa_bg.wasm | `ae2485152c262352f9835b07dc9ad81117a08ee05e29fcd23499479384f1e008` |
| wasm-bindings.js | `1b591e83fa0470394174736c9eeba2ec9e2624bfc5dde5ade56838154b412c7c` |
| LICENSE | `5aeea31bc245dd31213e7ff878a40362d6d4d8bc8093e34a0f30ed7639fe93c6` |
| LICENSE-wasm | `5aeea31bc245dd31213e7ff878a40362d6d4d8bc8093e34a0f30ed7639fe93c6` |
| LICENSE-utilities | `5aeea31bc245dd31213e7ff878a40362d6d4d8bc8093e34a0f30ed7639fe93c6` |
| C2PA-TRUST-LIST.pem | `859f422cf4744a45de6f073b258d76381c91a9624c10aaa40543c19c1f124e13` |
| C2PA-TSA-TRUST-LIST.pem | `eca8347ee71e31d226e00c85b15aca356116fefe6c26ed8c0ee1f954115b1990` |
| LICENSE-trust-list | `9e5f1b3c610b9c2da5c313bf81d577a7d1acec686bdb0384edefa6df0f90cd94` |
