# Vendored C2PA runtime

Snapshot date: 2026-11-21. Package: **@contentauth/c2pa-web 0.17.1**, MIT.
Source: https://registry.npmjs.org/@contentauth/c2pa-web/-/c2pa-web-0.17.1.tgz
Project: https://github.com/contentauth/c2pa-js
Docs: https://opensource.contentauthenticity.org/docs/c2pa-js/packages/c2pa-web/

Exact bundled dependencies: @contentauth/c2pa-wasm 0.15.1 (MIT),
@contentauth/c2pa-utilities 0.5.2 (MIT), highgain 0.1.0 (ISC).
@contentauth/c2pa-types 0.8.0 is types-only. Build tool: esbuild 0.25.12;
no build tool is shipped as runtime. LICENSE, LICENSE-wasm, LICENSE-utilities
are upstream licence files. highgain's package declares ISC and Eli Mensch as
author but omits a licence file; LICENSE-highgain supplies the ISC notice.

## Small worker URL patch

The published Config exposes wasmSrc (string or WebAssembly.Module) and workerSrc
(URL). No supported option changes validateWorkerSrc's HTTPS-only rule.
The exact pristine upstream built file dist/builder-CaTgrAW1.js is preserved as
builder.upstream.js beside builder.patched.js. worker-url.patch contains the
complete one-line change. SDK algorithms and all signature validation code are
unchanged. The application always passes chrome.runtime.getURL() packaged paths.

```diff
-  if (r.protocol !== "https:")
+  if (r.protocol !== "https:" && !(r.protocol === "chrome-extension:" && globalThis.location?.protocol === "chrome-extension:" && r.host === globalThis.location.host))
```

HTTPS behavior is preserved. The added branch only accepts the running extension's
host, from an extension context. Foreign-extension, HTTP, blob and file URLs are
rejected. sdk.js bundles this patched file and dependencies with esbuild (ESM,
chrome120 target). c2pa_worker.js and c2pa_bg.wasm are unmodified upstream files.
wasm-bindings.js is unmodified @contentauth/c2pa-wasm/pkg/c2pa.js for real Node
WASM cross-checks; it is not imported by the panel. Source hashes below and
SHA256SUMS.json allow verification. These are vendored-software hashes, never
user-image evidence hashes.

Rebuild: install exact versions in a temporary directory, place the official
trust PEMs and licence there, then run `node vendor.mjs /absolute/temp`.
Use a temporary directory; do not modify the extension's package dependencies.

## Official trust snapshot

C2PA-managed lists from c2pa-org/conformance-public, CC BY 4.0; attributed to C2PA.
Downloaded 2026-11-21, unchanged. LICENSE-trust-list preserves the full licence.

- https://github.com/c2pa-org/conformance-public/tree/main/trust-list
- https://raw.githubusercontent.com/c2pa-org/conformance-public/main/trust-list/C2PA-TRUST-LIST.pem
- https://raw.githubusercontent.com/c2pa-org/conformance-public/main/trust-list/C2PA-TSA-TRUST-LIST.pem

These are offline PEM trust anchors, not a live revocation service. No test root
is bundled here. Snapshot updates require an explicit code review and new hashes.

## SHA-256 file hashes

| File | SHA-256 |
| --- | --- |
| builder.upstream.js | `892c16674f9ffc5f225548b9c47b29781a1072eb7cad8c424ce2efae057f6a7b` |
| builder.patched.js | `af671bd758fe8c3dbb094f840d2eca07bc3c241b2954e1aab5738bcb327e9a9c` |
| worker-url.patch | `1e9d9a5f07e09e2a5a44243dd92a394e5d937dce2159d1a3e05ff764ec219b82` |
| sdk.js | `34843788b6f0ac68f7a68faaa1385e3f038bc3ca03c8e7f564d255c065e5de07` |
| c2pa_worker.js | `fb4cbff3b4b3df7cdc03328554a38a84de90f9949bc43a7078a37da1bfd82ac7` |
| c2pa_bg.wasm | `53f29186e4beb70940d34b50e7c92b0c6c8663d39b99667ea6e0aca85dc00460` |
| wasm-bindings.js | `6197308395e9aed2395edbf04256d467f81360022a760307f90c643a4dc612f8` |
| LICENSE | `5aeea31bc245dd31213e7ff878a40362d6d4d8bc8093e34a0f30ed7639fe93c6` |
| LICENSE-wasm | `5aeea31bc245dd31213e7ff878a40362d6d4d8bc8093e34a0f30ed7639fe93c6` |
| LICENSE-utilities | `5aeea31bc245dd31213e7ff878a40362d6d4d8bc8093e34a0f30ed7639fe93c6` |
| C2PA-TRUST-LIST.pem | `859f422cf4744a45de6f073b258d76381c91a9624c10aaa40543c19c1f124e13` |
| C2PA-TSA-TRUST-LIST.pem | `eca8347ee71e31d226e00c85b15aca356116fefe6c26ed8c0ee1f954115b1990` |
| LICENSE-trust-list | `9e5f1b3c610b9c2da5c313bf81d577a7d1acec686bdb0384edefa6df0f90cd94` |

## Approved v2 repin (2026-11-22; implementation pending)

The approved target for BOTH clients is @contentauth/c2pa-web 0.16.0 (MIT),
utilities 0.4.0, WASM 0.14.0 and types 0.7.8. The runtime and hashes above still
refer to the currently installed 0.17.1; update them only after re-vendoring and
real-WASM/c2patool checks pass. No website SDK is integrated yet.

The age exception for 0.17.1 is WITHDRAWN. 0.16.0 was published on
2026-11-04 at 22:14:21.918 UTC, more than two weeks before this audit.
Official 0.16.0 archive integrity, independently matched against npm metadata:

`sha512-FEvdoYxejhSMtQ0Z0EwUM2S+6StjAWGcLHMi8eqFvzkXIKwW/2f/A+N8HRsTno8RPj8oNx1g5GFBjPw3uSQPzQ==`

Source: https://registry.npmjs.org/@contentauth/c2pa-web/-/c2pa-web-0.16.0.tgz

Reason for repin: utilities 0.5.2 (used by web 0.17.1) adds fetchTrustSetting
(settings.js:270) and executeTrustFetch (:295), plus timestamp trust-anchor URL
resolution. These wrappers/branch are absent from utilities 0.4.0 (web 0.16.0).
0.16.0 still has resolveTrustSettings -> fetchWithRetry URL fetching. See the
[SDK audit](../../../../docs/provenance/SDK_AUDIT.md) for the exact comparison,
publisher/provenance findings and historical 0.17.1 registry integrity.

Network ban scope: provenance verification only. The user explicitly prohibits
changing existing CSP values or detector connections. Preferred sandbox startup
would require fetching WASM despite connect-src 'none', or a different resource
bootstrap protocol. The permitted fallback is a dedicated worker which disables
fetch, XMLHttpRequest, WebSocket, importScripts and navigator.sendBeacon BEFORE
loading the SDK. This is defence in depth, not a CSP guarantee. Both clients must
have effective offline settings and failing-spy tests over remote-manifest,
unknown-signer and expired-certificate files. Preserve detector/image acquisition
requests and test that separation. No browser execution has been claimed.

Repin, minimal worker URL adjustment, effective-settings tests, C2PA 2.x parsing,
real-WASM/c2patool agreement and website exact-version lock integrity are pending.
Real ChatGPT/Gemini local-original compatibility is unverified: the optional
real-world fixtures directory was absent at this audit.
