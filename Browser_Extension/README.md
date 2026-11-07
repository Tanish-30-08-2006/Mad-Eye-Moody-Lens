# Mad Eye Moody Lens – Generalized Browser Extension

Mad Eye Moody Lens is a Chrome extension prototype for screening prominent images shown on webpages. It sends eligible image URLs to a configured detection provider and displays the returned verdict and confidence on the image. It also includes a side panel for manual image review.

> **Current provider:** BitMind Oracle API. The project is organized so the API integration can be adapted to other providers that expose a compatible image-detection endpoint and response, or by adding a provider adapter.

## Project structure

```text
mad-eye-moody-lens/
├── manifest.json              # Chrome Manifest V3 entry point (must stay at root)
├── .gitignore
├── README.md
│
├── frontend/
│   ├── popup.html             # Extension popup
│   ├── popup.css
│   ├── popup.js
│   ├── sidepanel.html         # Manual image-review panel
│   ├── sidepanel.css
│   ├── sidepanel.js
│   ├── content.js             # Finds eligible webpage images and renders badges
│   └── overlay.css            # In-page detection badge styles
│
└── backend/
    └── background.js          # Extension service worker, API calls, storage and cache
```

### Why is `manifest.json` at the root?

Chrome expects `manifest.json` at the root of the folder selected through **Load unpacked**. The actual extension interface and page-scanning code live in `frontend/`; the background service worker and API integration live in `backend/`.

### What does “backend” mean in this prototype?

`backend/background.js` is a Chrome Manifest V3 service worker, not a separately hosted Node.js server. It calls the BitMind HTTPS API directly, manages the API key in `chrome.storage.local`, coordinates scans, and stores recent detection metadata. No `npm install`, build command, or local server is required.

## Requirements

- Google Chrome with support for Manifest V3 and the Side Panel API.
- A valid BitMind API key for detection using the current provider.
- Internet access to reach the configured detection API.

## Installation (Load unpacked)

1. Download or clone this project and extract it if it is a ZIP archive.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `mad-eye-moody-lens` project folder — the folder containing `manifest.json`.
6. Pin Mad Eye Moody Lens to the Chrome toolbar for easier access.
7. Click the extension icon, enter your BitMind API key, and choose **Save key**.
8. Use **Test key** to send a test request and verify the connection.
9. Enable **Automatic scanning** and approve the requested website access permission.
10. Refresh any tabs that were already open before automatic scanning was enabled.

## How to use

### Automatic webpage scanning

1. Open a webpage containing images.
2. Click the Mad Eye Moody Lens extension icon.
3. Enable **Automatic scanning on websites**.
4. Choose a minimum image-size threshold in the popup.
5. Scroll through the page. Eligible, sufficiently visible images are submitted for detection and receive a result badge when the API responds.
6. Use **Scan this tab now** to request a fresh scan of the active tab and view diagnostic counters.

The scanner intentionally skips small images and common interface assets such as avatars, icons, logos, navigation images and other small UI elements. Automatic scanning can use API quota; use a higher image-size threshold to reduce requests.

### Manual image review

1. Open the extension popup.
2. Select **Open full image review**.
3. Upload an image from your device, drag and drop an image into the side panel, or paste a publicly accessible image URL.
4. Select **Analyze image**.
5. Review the verdict, confidence, similarity field (when returned), request duration and raw API response.

You can also right-click a webpage image and select **Analyze image with Mad Eye Moody Lens**.

## Detection API configuration

The current service-worker integration sends requests to:

```text
POST https://api.bitmind.ai/oracle/v1/34/detect-image
```

It sends a Bearer API key and the application header `x-bitmind-application: oracle-api`. The request body currently uses this shape:

```json
{
  "image": "https://example.com/image.jpg",
  "rich": true
}
```

The current UI expects a response containing at least a Boolean `isAI` field. It can also display fields such as `confidence`, `similarity`, and `objectKey` when provided.

### Adding another detection provider

The API call and response validation are currently implemented in `backend/background.js`, mainly in `callBitMind()` and `analyzeImage()`. To integrate a different provider:

1. Review that provider's official endpoint, authentication requirements, request body, image input restrictions and rate limits.
2. Add a provider configuration or adapter in `backend/background.js` rather than placing API secrets in frontend files.
3. Normalize the provider response to the fields consumed by the frontend, or update the UI to render that provider's schema.
4. Update the API test action and README documentation.
5. Test error handling, quota limits, image formats and privacy behavior before using it broadly.

A different provider may not be compatible by changing only the API key. Endpoint URLs, headers and response schemas can differ.

## Permissions and privacy

- **Storage:** saves the API key, scan preferences, local detection cache and recent result metadata in the current Chrome profile.
- **Context menus:** adds the right-click image analysis action.
- **Side panel:** opens the manual review interface.
- **Scripting and tabs:** registers/injects the content scanner and communicates with the active tab.
- **Optional website access:** requested when automatic scanning is enabled, so the extension can inspect eligible webpage images.
- **BitMind host access:** allows the service worker to call the BitMind API.

Image URLs submitted for detection are sent to BitMind. Do not scan sensitive or private images unless you are comfortable sharing them with the detection provider. The API key is stored locally in Chrome extension storage; do not share your Chrome profile, browser data directory, or API key. Revoke or rotate the key from the provider account if it is exposed.

The local cache stores result metadata keyed by image URL; it is not intended as a permanent image archive. Detection outputs are estimates, not forensic proof that an image is genuine or manipulated.

## Troubleshooting

- **Extension does not load:** select the folder containing the root `manifest.json`, not the `frontend` or `backend` subfolder.
- **API key missing:** save the key in the extension popup.
- **401/403 response:** check that the key is valid and enabled for the selected endpoint.
- **429 response:** the provider may have rate-limited the account or the quota may be exhausted. Pause automatic scanning and retry later.
- **No image badges:** verify that automatic scanning is enabled, grant website access, refresh the tab, and use **Scan this tab now**. Check the diagnostic counters in the popup.
- **Some images are skipped:** the scanner filters images by size, visibility and likely UI context to limit noise and API usage.
- **A site image fails:** the page may use a protected, temporary, authenticated or otherwise inaccessible image URL. Try the manual review panel or the context-menu action.

## Development notes

This is a college-project prototype and is not a production forensic verification system. The automatic scanner currently focuses on standard webpage image elements and supported social-feed media containers. CSS backgrounds, canvas-only graphics, closed Shadow DOM content, video frames, authenticated image URLs and some site-specific image implementations may not be detected reliably.

No package manager is required for the current extension. For changes, edit the relevant files, return to `chrome://extensions`, and click **Reload** on the extension card. Refresh the webpage to reload its content script.
