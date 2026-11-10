# Mad Eye Moody Lens – Provider-Configurable Browser Extension

Mad Eye Moody Lens is a Chrome Manifest V3 extension for screening prominent images shown on webpages. It can automatically scan eligible webpage images, analyze an image manually, and display a normalized detection result.

The extension includes the original **BitMind Oracle** integration and a configurable **Custom REST API** connector. The connector supports common single-request HTTP POST image-detection APIs. It does not claim compatibility with every API protocol: OAuth refresh flows, signed requests, asynchronous job polling, and unusual multi-step protocols require a dedicated adapter.

Detection results are probabilistic signals, not forensic proof that an image is genuine or AI-generated.

## Project structure

```text
Browser_Extension/
├── manifest.json
├── README.md
├── assets/
│   └── provider-test-image.png
├── backend/
│   ├── background.js
│   └── providers/
│       └── provider-engine.js
├── frontend/
│   ├── content.js
│   ├── overlay.css
│   ├── popup.html
│   ├── popup.css
│   ├── popup.js
│   ├── options.html
│   ├── options.css
│   ├── options.js
│   ├── sidepanel.html
│   ├── sidepanel.css
│   └── sidepanel.js
└── tests/
    └── provider-engine.test.cjs
```

`backend/background.js` is the Manifest V3 extension service worker, not a separately hosted Node.js backend. It routes image requests to the selected provider, handles API credentials in extension storage, normalizes responses, and manages a provider-specific cache. `backend/providers/provider-engine.js` contains validation and response-normalization logic shared by the custom provider integration and its tests.

## Requirements

- Google Chrome with Manifest V3 and the Side Panel API.
- A BitMind API key for the BitMind provider, or access to a compatible custom image-detection REST API.
- Internet access for remote detection providers.
- Node.js is required only to run the included provider-engine unit tests; the extension itself does not require a package install or build step.

## Installation

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the `Browser_Extension` directory containing the root `manifest.json`.
5. Pin Mad Eye Moody Lens to the toolbar.
6. Save a BitMind API key in the popup, or open **Manage provider settings** to configure a custom REST API.
7. Select the desired provider in the popup.
8. Enable automatic scanning and grant website access when prompted, or use manual image review.

After changing extension source files, click **Reload** on the extension card in `chrome://extensions`, then refresh pages where the content script is running.

## Using BitMind

1. Open the extension popup.
2. Keep **BitMind Oracle** selected.
3. Enter the BitMind API key and select **Save key**.
4. Optionally select **Test key** to verify the saved credential.
5. Use manual image review or enable automatic webpage scanning.

The BitMind adapter retains the existing endpoint and request contract:

```http
POST https://api.bitmind.ai/oracle/v1/34/detect-image
Authorization: Bearer <API_KEY>
x-bitmind-application: oracle-api
Content-Type: application/json
```

```json
{
  "image": "https://example.com/image.jpg",
  "rich": true
}
```

The adapter expects a Boolean `isAI` field. It also maps confidence and similarity into the common result object. Manual uploads continue to be passed as image data URIs as in the original prototype.

## Configuring a Custom REST API

1. Open the extension popup and select **Manage provider settings**.
2. Enter a provider display name and absolute POST endpoint URL.
3. Select authentication: Bearer token, API key in a custom header, or no authentication.
4. Add optional non-reserved headers as a JSON object.
5. Select how the image is sent:
   - **JSON image URL** – sends the public image URL as a JSON field. This is the lightest option and does not require the extension to download image bytes.
   - **JSON Base64 data URI** – downloads the image bytes and sends a Base64 data URI in JSON.
   - **Multipart file upload** – downloads the image bytes and sends them as a multipart file field.
   - **Raw image bytes** – sends the image bytes as the request body and sets the image content type.
6. Configure the image field name and optional model ID/field or model header.
7. Map the response fields using dot paths. Numeric array indexes are supported (for example, `predictions.0.label`).
8. Define the labels that mean AI-generated and not AI-generated for label-based responses.
9. Select **Save custom provider** and approve the exact API origin permission requested by Chrome.
10. Select **Test saved provider**. In JSON image URL mode, the test sends a public sample image URL; in Base64, multipart, and raw-byte modes, it sends a small bundled sample image.
11. Return to the popup and select **Custom REST API** as the active provider.

### Supported request formats

| Format | Request body | Notes |
|---|---|---|
| JSON image URL | `{ "image": "https://..." }` | Provider must fetch the public image URL itself. |
| JSON Base64 | `{ "image": "data:image/jpeg;base64,..." }` | Extension fetches URL images before upload; local file uploads are supported. |
| Multipart | Image file field plus optional model field | Browser sets the multipart boundary automatically. |
| Raw bytes | Image bytes | Optional model ID is sent in a configurable header. |

The default image field is `image`; the default model field is `model`. Empty model IDs are omitted.

### Response mapping

A provider may return a Boolean field:

```json
{
  "result": {
    "is_ai": true,
    "score": 0.94,
    "model_name": "detector-v2"
  }
}
```

Example mappings:

- Boolean AI field: `result.is_ai`
- Confidence: `result.score`
- Model name: `result.model_name`

Alternatively, a provider may return a label:

```json
{
  "predictions": [
    { "label": "fake", "score": 0.94 }
  ]
}
```

Example mappings:

- Boolean AI field: leave blank
- Label: `predictions.0.label`
- Confidence: `predictions.0.score`
- AI labels: `fake, ai, ai-generated, synthetic`
- Not-AI labels: `real, human, authentic, not-ai`

Confidence values from 0 to 1 are treated as fractions; values above 1 through 100 are treated as percentages. These values are normalized for display, but they are not assumed to be calibrated or comparable across providers.

An unknown label or missing Boolean verdict is reported as **inconclusive**. It is never silently converted to a not-AI result. A recognized verdict below 0.60 confidence is shown as uncertain.

## Permissions and privacy

- **Storage:** provider credentials, scan preferences, detection cache and recent result metadata are stored in the current Chrome profile. Extension storage access is restricted to trusted extension pages and the service worker; webpage content scripts receive only non-secret scanner settings through extension messages. This is extension-local storage, not a hardware-backed secret vault.
- **Website access:** automatic scanning requests website access separately from API access. Scanning is opt-in and can consume provider quota.
- **API host access:** the Custom REST settings page requests permission for the configured API origin only. Users can review or revoke extension site access in Chrome settings.
- **Image transmission:** URL mode sends the image URL to the selected provider. Base64, multipart and raw-byte modes transmit image bytes. Review the selected provider's privacy and retention practices before analyzing sensitive images.
- **Image fetching:** for upload transports, the extension fetches public HTTP(S) image URLs from the service worker. Private/local image hosts are blocked by this generic fetch path; upload the image directly instead. The image host must be accessible to the extension.
- **Cache:** URL results are cached for 24 hours. Cache keys include the provider and that provider's configuration version, so switching providers or updating a configuration does not reuse a different provider's result.

## Known limitations

- The generic connector supports one HTTP POST request with the four listed image transports. OAuth refresh, signed requests, async job polling and multi-step APIs need dedicated adapters.
- Some providers require nonstandard request fields or response mapping. Check their API docs and configure the field paths and labels accordingly.
- Remote image hosts may block extension fetches, require authentication, or return redirects. For byte-upload modes, upload the image manually or use a provider that accepts image URLs.
- The automatic scanner focuses on standard image elements and supported social-feed media containers. CSS backgrounds, canvas-only graphics, closed Shadow DOM content and video frames are not universally covered.
- Automatic scanning uses API quota. A higher image-size threshold can reduce requests.
- Provider confidence scores may have different meanings and calibration. The extension does not compare them as equivalent probabilities.
- This is a college-project prototype, not a forensic verification product.

## Development and tests

Run the provider-engine unit tests from this directory:

```bash
node --test tests/provider-engine.test.cjs
```

The tests cover response mapping, confidence normalization, inconclusive results, endpoint validation, authentication requirements and request configuration validation. They do not replace live integration tests against a real provider account.

No npm install or build process is required. Reload the unpacked extension in Chrome after source changes.
