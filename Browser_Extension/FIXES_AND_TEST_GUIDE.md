# Mad Eye Moody Lens – Updated Provider & Video Guide

## Fixes in this update

- Video drop/upload waits for metadata and frame extraction before analysis. Unsupported files and files over the extension's existing upload limit show a useful message.
- ZeroTrue video scans of uploaded video files send the complete video to ZeroTrue when its provider is selected. Frame-based analysis remains available for BitMind and the local Moody Lens provider when captured frames are supplied.
- **BitMind direct public video URLs now download the actual video bytes in the extension and submit them using BitMind's documented multipart `video` upload field.** This replaces the previous approach of sending an arbitrary third-party URL as JSON, which the video endpoint examples do not define as the general-purpose direct-media workflow.
- BitMind videos up to 10 MB use the documented direct multipart `/oracle/v1/34/detect-video` upload. Videos larger than 10 MB and up to 200 MB use BitMind's documented three-step presigned S3 flow (`get-video-upload-url` → S3 multipart upload → `detect-video` with the returned S3 `videoUrl`).
- When a direct video URL is entered in the side panel, the extension requests access to only that URL's host using Chrome's optional host permissions. Grant the prompt so the service worker can download the media bytes. The extension validates the final response type, size, and redirect destination before uploading.
- BitMind HTTP/API errors are now surfaced with the provider response instead of being silently discarded and replaced by the generic “no frame was captured” message. A missing Boolean verdict is not displayed as a real/authentic result.
- ZeroTrue automatic webpage image scans now download the actual public image bytes in the extension service worker, normalize browser-decodable WebP/AVIF/GIF/SVG images to JPEG when needed, and submit the bytes through the same documented `POST https://api.zerotrue.app/api/v1/analyze/file` multipart workflow used by manual image uploads. The unsupported `/api/v1/check` request with `input.type=image` has been removed.
- ZeroTrue direct public video URLs now use the official synchronous `POST https://api.zerotrue.app/api/v1/analyze/url` endpoint with multipart fields `url`, `api_key`, `is_private_scan=false`, and `is_deep_scan=false`. The extension first lets ZeroTrue fetch the original media, then falls back to browser download + `/analyze/file` if possible, and finally to captured video frames when a playing tab has supplied frames.
- The undocumented `app.zerotrue.app` fallback route has been removed. API requests now use the documented `https://api.zerotrue.app` base URL, so a route failure is no longer hidden behind a second unrelated HTML 404 page.
- The ZeroTrue API-key test uses the same documented file endpoint and the documented API-key form field.
- Direct video URL input must point to a downloadable media file (MP4, M4V, MOV, AVI, MKV, WebM, or WMV). Player/watch-page URLs are not equivalent to direct media URLs and should be scanned while playing in a tab so frames can be captured.
- ZeroTrue image/video result normalization supports the documented response envelope and fields (`ai_probability`, `combined_probability`, `human_probability`, `result_type`, `details_summary`, and feedback). It recognizes `ai_generated` and `human_created` result labels and percentage-valued fields.
- ZeroTrue file and URL requests include `is_deep_scan=false` and `is_private_scan=false`. The client does not silently retry a failed public scan as a private scan.
- Automatic scanning now ignores images whose actual source dimensions are still zero or whose load has not completed; it waits for the image's load event rather than submitting an empty placeholder. Diagnostics label the sample as a filter sample so it is not confused with the last API error.
- The documented `/analyze/url` endpoint is synchronous; API failures are surfaced as errors and never converted into a fabricated 50% / inconclusive verdict.
- API references used: ZeroTrue's official API skill documentation (https://raw.githubusercontent.com/ZeroTrueLCC/zerotrue-skills/main/skills/zerotrue/SKILL.md) and BitMind's official API reference (https://docs.bitmind.ai/api-reference). BitMind documents multipart uploads up to 10 MB and the presigned S3 workflow for files up to 200 MB.
- Provider configuration status reports ZeroTrue for video as well as BitMind/custom/local providers.
- Existing image, audio, history, cache, auto-detection, and provider selection flows are retained.


## Follow-up fix for video URL HTTP 401/403 responses (v2.0.2)

- BitMind direct URL analysis already tries the documented `detect-video` URL request. The previous extension also tried to download the video in its service worker, but it used `credentials: "omit"` and sent no originating-page referrer. That can fail for sources that require a browser sign-in session or referrer.
- The BitMind URL-download path now requests the entered media host permission and downloads with `credentials: "include"` so the browser can send cookies belonging to that media host. It also passes the active page URL as a referrer with `strict-origin-when-cross-origin`; only the source-page origin is sent cross-site, and query strings/fragments are stripped. The ZeroTrue and Moody Lens download paths continue to omit browser credentials.
- These changes can help when the media server requires an existing browser session or hotlink referrer. They cannot override a server-side 401/403, expired signed URL, anti-bot policy, or a provider-side block. Chrome host permission grants the extension permission to make the request; it does not grant access to a protected video.
- If both the browser download and BitMind's own URL fetch return 401/403, the side panel now explains this as a source-access restriction (not a detection verdict). Download the video from the original site while signed in, then drag the saved MP4/MOV/AVI/MKV/WebM file into the Video tab. This uses BitMind's documented upload flow and avoids asking either service to retrieve a blocked URL.
- The extension does not try to bypass authentication, anti-bot checks, expiring signatures, or access controls. It does not send the media site's cookies to BitMind; the browser uses them only for the original media-host download attempt.
- Extension version: `2.0.2`.

## Install/update the extension

1. Unzip the updated archive.
2. Open Chrome and visit `chrome://extensions`.
3. Turn on **Developer mode**.
4. If the old extension is loaded as an unpacked folder, click **Reload** on it or remove the old unpacked copy first.
5. Click **Load unpacked** and select the `Browser_Extension` folder from the extracted archive.
6. Open the extension's **Settings** in the side panel and save your BitMind and/or ZeroTrue API key.
7. For image auto-detection, select the provider in the Image tab and enable scanning from the extension controls. Auto scans use the currently selected image provider.

## Manual verification

### Image – BitMind
1. Open the side panel → Analyse → Image.
2. Select **BitMind Oracle**.
3. Drop an image or use **Choose file**.
4. Click **Analyze Image**.

### Image – ZeroTrue
1. Select **ZeroTrue Cloud AI** in the Image provider dropdown.
2. Drop an image or use **Choose file**.
3. Click **Analyze Image**.
4. For auto-detection, select ZeroTrue as the image provider in settings, enable scanning, then scroll a page containing loaded images that pass the configured size threshold. Automatic scans fetch the source image bytes and use the same multipart upload endpoint as manual uploads.

### Video – drag/drop
1. Open Analyse → Video.
2. Drag an MP4/WebM/MOV video into the video drop area, or use **Choose video file**.
3. Wait until the file information reports that extracted frames are ready.
4. Select a provider and click **Analyze Video**.
5. ZeroTrue receives the whole uploaded video file. Other providers use extracted frames according to their existing provider workflow.

### Video – public URL (BitMind)
1. Paste a direct public media-file URL (for example, an MP4 ending in `.mp4`), not a YouTube/watch/player page.
2. Select **BitMind detect-video** and click **Analyze Video**.
3. When Chrome asks for permission to access the media host, choose **Allow**. For BitMind URL downloads, the extension includes cookies for that media host (when available) and sends only the active page's origin as a cross-site referrer. The page query string and fragment are stripped. ZeroTrue and Moody Lens continue using anonymous URL downloads.
4. The extension downloads the media and uploads it to BitMind. Files up to 10 MB use direct multipart upload; larger files use BitMind's presigned S3 workflow (up to 200 MB).
5. If the host still returns HTTP 401/403 and BitMind's URL fetch also fails, the source is not accessible through that URL. Download it from the original site while signed in, then drag the saved file into the Video tab. The extension displays this distinction instead of asking you to repeatedly change Chrome permissions.

### Video – public URL (ZeroTrue)
1. Paste a direct public media-file URL and select **ZeroTrue Video AI**.
2. Click **Analyze Video**. ZeroTrue's documented URL endpoint is used first, with the extension's file-upload fallback when needed.

For YouTube, social-media, or streaming/player pages, open the page and scan the video while it is playing so the extension can use captured frames. A watch page is not a direct media-file URL.

## Tests

Run the extension's Node tests from this folder:


```bash
cd Browser_Extension
node --test backend/tests/*.test.mjs tests/*.test.cjs
```

Tests use mocked provider requests; they do not make live API calls. The latest local run completed with **44 tests: 39 passed, 0 failed, 5 skipped**. New tests cover BitMind MP4 URL download + multipart upload, and the >10 MB BitMind presigned S3 workflow. The five skipped tests require a running Moody Lens backend. A real provider smoke test still requires your own valid API key.


## Troubleshooting the Yahoo / webpage auto-scan diagnostics

- Automatic ZeroTrue scans do not call `/api/v1/check`. They fetch the actual webpage image and upload its bytes to the documented `/api/v1/analyze/file` endpoint. Manual uploads and automatic webpage scans therefore use the same ZeroTrue file-analysis route.
- An HTML `404 Not Found` from the file API indicates that the API host or route is unavailable. The extension now calls only the documented `https://api.zerotrue.app` endpoint and displays the error rather than trying an undocumented `app.zerotrue.app` fallback.
- `Filter sample: noGeometry ... box=...×0 ... natural=0×0` is not the API failure. It describes an image element that has no rendered height or decoded natural dimensions. The scanner skips it until it has usable geometry.
- For BitMind video URLs, allow Chrome's host-permission prompt for the media domain. The URL must return video bytes, not an HTML player page. The service worker now reports HTTP status, content-type, size, and BitMind API errors.
- BitMind direct multipart uploads are limited to 10 MB; the documented S3 upload workflow supports videos up to 200 MB. Larger files are rejected with a clear message.
- ZeroTrue's URL-analysis endpoint also requires a direct media-file URL with a supported extension. A YouTube/watch/player webpage URL is not a direct video file; use the playing-tab scanner for those sources.
- After updating the unpacked extension, click **Reload** on `chrome://extensions`, refresh the side panel, confirm the desired video provider is selected, and test with a direct `.mp4` file URL.
- If auto scanning still fails, copy the updated `Last error` line and provider status from the side panel. Do not share your API key.
