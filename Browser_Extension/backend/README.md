# Mad-Eye Moody Lens browser extension: unified service worker

This folder is one Manifest V3 service worker covering all three modalities. The Chrome extension (`Browser_Extension-backend`) is the primary: its image and audio code is kept as it was. The video engine from `backend_for_video_testing` is merged in as a separate section.

| Modality | Engine | Providers |
| --- | --- | --- |
| Image | `providers/provider-engine.js` | BitMind `detect-image`, ZeroTrue `/analyze/file`, Custom REST, **Mad-Eye Moody Lens server** |
| Audio | `audio/*` | Local WebSocket model (`ws://127.0.0.1:8765`), ZeroTrue, **Mad-Eye Moody Lens server** (deep analysis) |
| Video | `providers/video-provider-engine.js` | BitMind `detect-video` (falls back to captured frames), ZeroTrue `/analyze/file` + `/analyze/url`, Custom REST, **Mad-Eye Moody Lens server** |

"Mad-Eye Moody Lens server" is the team's own backend (`functional-ui-models-backend`, `/api/v1`), which runs the project's pretrained models. `providers/moodylens-client.js` turns its answers into the shapes the existing UIs already render, so no new result view is needed.

## Manifest requirements

The manifest and the UI files (popup, side panel, content scripts, `frontend/audio/offscreen.html`) were not part of the merged zips. The manifest must include:

```jsonc
{
  "manifest_version": 3,
  "background": { "service_worker": "background.js", "type": "module" },   // "type": "module" is required
  "permissions": ["storage", "contextMenus", "sidePanel", "scripting", "tabs", "tabCapture", "offscreen"],
  "host_permissions": ["https://api.bitmind.ai/*", "https://api.zerotrue.app/*"],
  "optional_host_permissions": ["http://*/*", "https://*/*"]   // page scanning, custom providers, the team server
}
```

Module workers cannot call `importScripts`, so the video engine is now loaded with `import`. The test-key buttons load `assets/provider-test-image.png` (image) or `assets/test-frame.png` (video), using whichever one is bundled.

## Messages

Image and audio messages are unchanged and keep their original response shapes. Video messages answer `{ok, data}` or `{ok, error}`, as before.

| Message | From | Notes |
| --- | --- | --- |
| `SCAN_VIDEO {payload}` | content script, side panel | `payload`: `videoUrl`, `frames[{dataUri, timestamp}]` or `frameDataUri`, `title`, `thumbnail`, `scanType`, `videoDuration`, `cacheHash` |
| `VIDEO_PING`, `VIDEO_CHECK_PROVIDER_CONFIG`, `VIDEO_OPEN_SIDEPANEL` | anywhere | Old names `PING`, `CHECK_PROVIDER_CONFIG`, `OPEN_SIDEPANEL` still work |
| `VIDEO_GET_HISTORY`, `VIDEO_CLEAR_HISTORY`, `VIDEO_DELETE_HISTORY_ITEM {id}` | anywhere (as before) | **`GET_HISTORY` is the image history.** Video UIs must switch to `VIDEO_GET_HISTORY`. `CLEAR_HISTORY` and `DELETE_HISTORY_ITEM` still work. |
| `VIDEO_TEST_PROVIDER_KEY {apiKey}` | extension pages | Old name `TEST_PROVIDER_KEY` still works |
| `VIDEO_SET_ACTIVE_PROVIDER {provider}` | extension pages | `bitmind`, `custom` or `moodylens` (new) |
| `VIDEO_GET_CUSTOM_PROVIDER_CONFIG`, `VIDEO_SAVE_CUSTOM_PROVIDER_CONFIG {config}` | extension pages | New: same validation and host-permission rule as the image custom provider |
| `SAVE_MOODYLENS_SERVER_CONFIG {url, apiKey?}` | extension pages | New. Request the server's host permission in the click handler first, e.g. `chrome.permissions.request({origins: ["http://127.0.0.1:8080/*"]})` |
| `GET_MOODYLENS_SERVER_CONFIG`, `TEST_MOODYLENS_SERVER` | extension pages | New. Returns `apiKeySet` (never the key), plus readiness and the loaded models |
| `SET_ACTIVE_PROVIDER {provider}` | extension pages | Image. Now also accepts `moodylens` |
| `SAVE_ZEROTRUE_CONFIG {engineMode}` | extension pages | Audio engine: `auto`, `local`, `zerotrue` or `moodylens` (new) |

In `auto` mode, audio deep analysis tries the local WebSocket model first, then ZeroTrue if a key is saved, then the team server if one is configured.

## Storage keys

The image and audio keys are unchanged. The video engine used the same un-prefixed keys as the image engine, so in a shared worker they would have overwritten each other. They now have a `video` prefix:

| Video extension key | Merged key |
| --- | --- |
| `activeProvider` | `videoActiveProvider` |
| `customProviderConfig` | `videoCustomProviderConfig` (moved automatically on update if it has `videoTransport`) |
| `detectionCache` | `videoDetectionCache` |
| `videoDetectionHistory`, `hoverScanEnabled`, `autoScanOnHover`, `hoverDelayMs`, `pendingReviewVideo` | unchanged |
| `apiKey`, `apiKeyUpdatedAt` | shared: one BitMind key serves both the image and video endpoints |

New keys: `moodyLensServerUrl` (default `http://127.0.0.1:8080`), `moodyLensApiKey` and `moodyLensUpdatedAt`.

## Fixes made while merging the video engine

- **Cache collisions.** The video cache key was the first 100 characters of a frame's data URI, which is the JPEG header and nearly identical for every frame. Different videos got each other's cached verdict. The key is now a SHA-256 over all frame bytes, or the public video URL.
- **Concurrency limit had no effect.** The limiter wrapped an already-started promise, so it never limited anything. It now wraps the provider call: at most 3 at a time.
- **Private URLs.** Private and intranet video URLs (`192.168.x`, `localhost`, `*.local`) were sent to BitMind. They now fall back to captured frames, matching the image engine's rule. Custom video requests now use `credentials: "omit"` and `redirect: "error"`.
- **Custom video provider rules.** Reserved headers and malformed header values are now refused, as in the image engine. The binary transport sends the frame's actual bytes, not the data-URI text labelled `video/mp4`.
- **Storage quota.** Image, audio and video share one `chrome.storage.local` quota. Thumbnails are kept only for the 50 newest history items, and the result cache stores no thumbnails or raw responses. History and cache writes are serialised so parallel scans don't drop entries.
- **History source.** A history item's `sourceUrl` is the page URL when the player uses a `blob:` URL.
- **Secrets from content scripts.** `GET_AUDIO_CONFIG` returned the ZeroTrue key to any sender, including content scripts. The audio and ZeroTrue settings messages are now limited to extension pages.
- **Audio stream address.** `AUDIO_SAVE_SERVER_CONFIG` now accepts only loopback `ws://` or `wss://` addresses, so live meeting audio stays on this computer.

## Tests

```bash
# from the extension root; Node 20+, no npm install
node --test backend/tests/*.test.mjs tests/*.test.cjs

# Against a running API, e.g. the stub stack (MML_DETECTOR_BACKEND=stub):
MML_E2E_URL=http://127.0.0.1:8000 MML_E2E_VIDEO=clip.mp4 node --test tests/
```
