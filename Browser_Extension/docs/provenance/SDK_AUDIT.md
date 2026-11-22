# SDK audit gate: 0.16.0 versus 0.17.1

Current outcome: both clients are repinned to official 0.16.0 with exact integrity.
The 0.17.1 age exception is withdrawn. The comparison below preserves why it was
rejected. Current runtime checks and limitations are in the final sections.
The dedicated-worker fallback is achieved in both clients; no CSP values changed.

Audit date: 2026-11-22 (Asia/Calcutta). Result: 0.17.1 rejected for v2; repin to 0.16.0 approved.
The user required an audit before relying on 0.17.1 and explicitly required a
stop if any check failed. This report does not authorize bypassing that gate.

| Check | Observed result |
| --- | --- |
| Official SDK tarball integrity | SHA-512 matches registry dist.integrity |
| Direct vendored upstream artifacts | Seven JS/WASM/license files match tarballs |
| Patched bundle reproduction | Pending; stop gate reached before reconstruction |
| Publisher | Same GitHub Actions trusted publisher in both versions |
| Provenance | Official release workflow and matching tarball subject digest |
| npm signature verification | Passed: 8 registry signatures, 4 attestations |
| New dependency names | None in compared manifests; dependency versions change |
| Install lifecycle scripts | None in SDK or inspected dependency manifests |
| No new network code | FAILED: utilities trust-fetch code and URL-resolution path changed |
| Website exact dependency and lock integrity | Not added: blocked before implementation |

## Evidence for the failed check

The published @contentauth/c2pa-web manifests depend on utilities 0.4.0 (web
0.16.0) and 0.5.2 (web 0.17.1). Compare their dist/settings.js and
dist/fetchWithRetry.js. The newer settings.js introduces fetchTrustSetting and
executeTrustFetch, request deduplication, timeout/abort handling, and HTTPS
redirect controls. resolveSettings also newly resolves tsaTrust URL resources.
This is new network-capable code relative to 0.16.0, even if the caller passes
PEM strings and avoids those paths. No claim of malicious behavior is made.

The browser packages already contain WASM loading through fetch and generated
WASM fetch bindings in both versions; those alone are not evidence of a new path.
Binary WASM was compared to its official artifact, not exhaustively source-audited.

## Reproduce without running package installation scripts

Download the four official archives linked below, verify each SHA-512 against
its registry version document, then extract them in separate temporary folders.
Compare the utilities dist/settings.js and dist/fetchWithRetry.js with a text
diff. Compare web package.json dependency names, versions and scripts.

For provenance/signatures, an isolated temporary install used:

```powershell
npm install --prefix AUDIT_TEMP --ignore-scripts --no-audit --no-fund --save-exact @contentauth/c2pa-web@0.17.1 esbuild@0.25.12
npm audit signatures --prefix AUDIT_TEMP
```

The temporary npm installation does not modify the website lockfile or execute
SDK runtime code. Publisher metadata alone is not signature verification; the
second command performed npm's verification and returned exit code 0.

## Official sources

- [Web 0.17.1 registry metadata](https://registry.npmjs.org/@contentauth%2fc2pa-web/0.17.1)
- [Web 0.16.0 archive](https://registry.npmjs.org/@contentauth/c2pa-web/-/c2pa-web-0.16.0.tgz)
- [Web 0.17.1 archive](https://registry.npmjs.org/@contentauth/c2pa-web/-/c2pa-web-0.17.1.tgz)
- [Utilities 0.4.0 archive](https://registry.npmjs.org/@contentauth/c2pa-utilities/-/c2pa-utilities-0.4.0.tgz)
- [Utilities 0.5.2 archive](https://registry.npmjs.org/@contentauth/c2pa-utilities/-/c2pa-utilities-0.5.2.tgz)
- [WASM 0.15.1 archive](https://registry.npmjs.org/@contentauth/c2pa-wasm/-/c2pa-wasm-0.15.1.tgz)
- [npm attestations](https://registry.npmjs.org/-/npm/v1/attestations/@contentauth%2fc2pa-web@0.17.1)
- [Attested source commit](https://github.com/contentauth/c2pa-js/commit/ccc2af3dbca1e24a18cd65fb63bde771b55b6f0d)

## Historical age exception (withdrawn)

The initial exception for 0.17.1 is withdrawn. It was published November 16 at
23:35:01.346 UTC and reaches 14 days on November 30 at that time / December 1
at 05:05:01.346 IST. That historical date is not an active waiver.

## Latest stop condition: propose 0.16.0 (2026-11-22)

The user's subsequent condition 1 requires stopping and proposing a repin if
0.16.0 lacks the added trust-fetch code. This condition is met:

| SDK | Dependency | File | Function | Present |
| --- | --- | --- | --- | --- |
| 0.17.1 | @contentauth/c2pa-utilities 0.5.2 | dist/settings.js:270 | fetchTrustSetting | Yes |
| 0.17.1 | @contentauth/c2pa-utilities 0.5.2 | dist/settings.js:295 | executeTrustFetch | Yes |
| 0.16.0 | @contentauth/c2pa-utilities 0.4.0 | dist/settings.js | fetchTrustSetting | No |
| 0.16.0 | @contentauth/c2pa-utilities 0.4.0 | dist/settings.js | executeTrustFetch | No |

The older utilities package does have basic trust-resource URL fetching:
resolveTrustSettings (line 200) calls fetchWithRetry at lines 213 and 224.
It lacks the added wrappers and tsaTrust URL-resolution branch. Therefore the
finding is not that 0.16.0 has no networking; it lacks this newly added code.
The exact published archive comparison, not a same-name-function assumption,
is the basis for the stop.

The user approved repinning both clients to 0.16.0. Its official tarball matches
registry integrity `sha512-FEvdoYxejhSMtQ0Z0EwUM2S+6StjAWGcLHMi8eqFvzkXIKwW/2f/A+N8HRsTno8RPj8oNx1g5GFBjPw3uSQPzQ==`.
It was published 2026-11-04 22:14:21.918 UTC; no age exception is required.
At that audit stage re-vendoring and website integration had not run; they are now complete as recorded below.

## Approved isolation scope

The current extension_pages policy has script-src and object-src only, no
connect-src/default-src. It does not establish a no-network boundary. Existing
background.js calls detector APIs/custom endpoints and downloads image/video
sources. A global connect restriction would change those working flows.
[Chrome documents](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
that extension_pages covers page and worker contexts, including the background
worker. The user therefore explicitly authorized a provenance-only network ban,
without changing existing CSP values or detector connections.

The permitted fallback is a dedicated worker neutralizing fetch, XMLHttpRequest,
WebSocket, importScripts and navigator.sendBeacon before SDK load. This is
DEFENCE IN DEPTH, NOT A CSP GUARANTEE. The preferred sandbox's connect-src 'none'
would prevent ordinary WASM fetch startup and require a different resource
bootstrap protocol. Sandbox execution has not been achieved or claimed.
Main-thread resource acquisition must remain packaged/same-origin and separate
from file verification. Effective-settings and failing-spy tests for both clients
(remote manifest, unknown signer, expired certificate), plus detector/image
acquisition regressions, are mandatory before completion.

## Local real-world audit

Browser_Extension/backend/tests/fixtures/real-world/ was absent on 2026-11-22.
No private/local ChatGPT or Gemini originals were inspected. Compatibility with
those originals remains unverified; automated tests must skip clearly when empty.
Existing synthetic/CAI samples are separate from user-supplied real originals.

## Commit 2: approved repin and achieved worker checks

Both dependency pins now use 0.16.0 with the official registry integrity in the
website lockfile and vendor VERSION.md. The minimal same-extension URL patch
was redone against pristine c2pa-CqMzdYCb.js. Trust snapshots were refetched at
f61352d703c756f4caa176ce3cbccc41a085c11a; 36 signer/24 TSA certs parsed, bytes
unchanged. All 49 existing provenance tests and eight c2patool comparisons passed
after repin before new behavior was added. The older WASM parses C2PA 2.4.0.

Achieved isolation is the approved dedicated-worker fallback, not a CSP guarantee.
Its five failing API guards run before dynamic SDK import. Actual SDK/WASM worker
checks cover remote-only manifest refusal, unknown signer and expired CAI sample;
all parent/worker verification network counts are zero. Node's test-only message
transport/FileReaderSync bridge preserves original Blob bytes and real crypto.
Effective settings retain trust checks, disable OCSP/remote fetch, reject trust
URLs and add separate native tsa anchors because utilities 0.4.0 lacks that
convenience mapping. No invented SDK fetch flags are claimed. Website tests and
native browser acceptance remain pending. Detector suites and byte acquisition
regressions remain required at every commit. No local real originals were found.

## Website achieved approach

Website uses the same neutralized-worker fallback. It fetches its own pinned
WASM asset during setup and compiles it inside the worker, preserving the existing
site CSP. Its reader-only transport reuses the official SDK's highgain protocol
and public Reader/Context; no website SDK URL patch is needed. Init messages are
queued until the packaged SDK is ready. Five parent/worker failing-spy checks
and forbidden main-thread WASM compilation pass over all three privacy fixtures.
Exact logic-copy and JSON parity checks pass. This remains defence in depth,
not a CSP guarantee or claimed native browser enforcement. Existing CSP values
are unchanged. Bundled licenses and vendor/VERSION.json record the artifact pin.

## Final repin verification

Fresh checksum-verified c2patool 0.29.0 and repinned WASM agree in all 12 signed
fixture/trust-mode combinations, including self-signed and expired. C2PA 2.4.0
parsing is confirmed. Both clients' actual worker tests cover remote-only,
unknown-signer and expired files with zero verification network calls. Parent
WASM compilation is forbidden in the website test. Website SDK source is bundled
without a URL patch; native worker startup reuses the SDK's highgain protocol.
Only the extension's documented same-host chrome-extension URL adjustment remains.

Website build/typecheck, categorical card states/escaping/races, exact copies and
all fixture JSON parity pass. HTTP-only preview served all lazy resources. Main
mounting JS grows about 0.79 kB; the 9.06 MB WASM and SDK are lazy. No browser run,
CSP enforcement guarantee or user-original compatibility is claimed. The
self-signed fixture's public certificate independently verifies its self-signature;
the SDK still cannot establish arbitrary-file certificate type, so no issuer-name
heuristic is used. Tests explicitly preserve detector/image download connections.
The optional originals folder is empty and its test skips honestly. TC260 omitted.
