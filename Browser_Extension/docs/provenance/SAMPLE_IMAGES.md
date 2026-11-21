# Sample images and expected results

## Upload the bundled Firefly sample

The original [Firefly_tabby_cat.jpg](../../backend/tests/fixtures/provenance/Firefly_tabby_cat.jpg)
is now in the existing backend/tests/fixtures/provenance/ folder. It is 1,047,024
bytes, moved byte-for-byte from the downloaded CAI original without re-encoding.
Open the side panel, Choose file, and select it. Before clicking Analyze, expect:

- **Unknown signer** (untrusted_signer).
- Signer: Adobe Firefly C2PA; tool: Adobe_Firefly.
- **Declared AI-generated**, with a Created action.

The signature and file binding validate, but the signer is outside the bundled
trust snapshot. Do not add a trust anchor just to make the badge green. The source,
upstream MIT licence, attribution and expected JSON are documented in
[FIXTURES.md](../../backend/tests/fixtures/provenance/FIXTURES.md).

## Public original-image links

These are original download links, not screenshots or gallery thumbnails. Open
the link, save the original file, then upload it using Choose file. Pasting a URL
may fail due to site access, CORS or redirects; that does not change the saved
file's credentials. Do not resize, screenshot or re-export before checking.

Observed on **2026-11-21** with @contentauth/c2pa-web 0.17.1 / WASM 0.15.1 and the
bundled official signer/TSA trust snapshot; remote manifests and OCSP were disabled.
Cryptographic checks used the real vendored WASM in Node, not Chrome automation.
Public files, certificate validity and trust lists can change, so these are dated
observations rather than promises about every future download.

| Public original | Observed badge | Details |
| --- | --- | --- |
| [Adobe Firefly tabby cat](https://contentauth.github.io/example-assets/images/Firefly_tabby_cat.jpg) | Unknown signer | Adobe Firefly C2PA; Adobe_Firefly; declared AI-generated; Created. Same original as the bundled sample. |
| [Photoshop-edited car](https://contentauth.github.io/example-assets/images/car-es-Ps-Cr.jpg) | Unknown signer | Adobe C2PA; Adobe Photoshop 26.11.0; Opened, Cropped and Resized. AI declaration not declared in the active manifest. |
| [ChatGPT image](https://contentauth.github.io/example-assets/images/ChatGPT_Image.png) | Signature invalid | SDK reports signingCredential.expired. Signer Truepic Lens CLI in Sora; tool ChatGPT; active action Opened. This shows an expired credential, not an assertion that pixels were tampered with. |
| [NASA astronaut PNG](https://raw.githubusercontent.com/scikit-image/scikit-image/v0.25.2/skimage/data/astronaut.png) | No credentials found | Bounded PNG inspection found no embedded C2PA marker. The photo's human subject does not establish a signed capture declaration. |
| [Official C2PA SDK GIF fixture](https://raw.githubusercontent.com/contentauth/c2pa-rs/main/sdk/tests/fixtures/sample1.gif) | Unsupported format after upload | Original starts GIF89a; our file-provenance feature supports JPEG, PNG and WebP only. |

The first three come from the
[official CAI example gallery](https://contentauth.github.io/example-assets/), which
also links manifest JSON and Adobe's online inspector for comparison. The NASA
sample is documented by [scikit-image](https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.astronaut)
as a public-domain NASA image. The GIF is published in the
[official c2pa-rs test fixtures](https://github.com/contentauth/c2pa-rs/tree/main/sdk/tests/fixtures).
Only the Firefly original is bundled by this documentation update; the other
public links are for optional downloads.

## Coverage of all six states

Not every state has a confirmed public original-image URL. In particular, trust
depends on the configured anchors, and Unavailable is an acquisition/runtime
condition. Use these honest acceptance cases rather than forcing a result:

| State | Repeatable check |
| --- | --- |
| verified / Verified credentials | Existing real-WASM test for signed.png with explicitly injected test-root-A.crt. No public download above was confirmed trusted by our production snapshot. This is an automated positive case, not a runtime trust bypass or a manually proven green badge. |
| untrusted_signer / Unknown signer | Bundled Firefly original, public Firefly/car links, or signed.png/untrusted.png with production anchors. |
| invalid / Signature invalid | Public ChatGPT example (expired, dated observation), or corrupted-signature.png and binding-mismatch.png for deterministic integrity failures. |
| no_credentials / No credentials found | Public NASA PNG, or plain.png/stripped.jpg/large-stripped.jpg. |
| unsupported_format / Unsupported format | Download and upload the public GIF, or any valid GIF. |
| unavailable / Unavailable | Paste http://127.0.0.1/image.jpg: the provenance URL reader rejects non-public hosts before fetching. Alternatively, a genuinely blocked public URL or a verifier load/timeout failure. No special image can guarantee this state across environments. |

From Browser_Extension/backend, the trusted positive check can be run with:

```powershell
node --test --test-name-pattern="real WASM and c2patool agree: signed, test-trusted" tests/provenance-verifier.test.mjs
```

The local backend on port 8080 is a detector provider and can be used normally;
the non-public-host restriction above applies to **image URL acquisition**, not
the existing provider connection. Never change permissions or runtime trust lists
to manufacture a badge. Complete the remaining Chrome checks in [TESTING.md](TESTING.md).
