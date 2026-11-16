# BitMind Video Deepfake Detector – Chrome Extension

A Chrome Manifest V3 browser extension for detecting AI-generated and deepfake videos across the web in real-time, powered by **BitMind Oracle (Bittensor Subnet 34)** or configurable custom REST detection APIs.

Inspired by the official [BitMind AI Detector](https://chromewebstore.google.com/detail/ai-detector-bitmind/ejlhmbdnjjlifeeelpnlkkechnmojnhg), this extension provides:
- **Universal Video Hover Detection:** Hover over any HTML5 video on any website (YouTube, X/Twitter, Reddit, TikTok, Instagram, news portals) to inspect deepfake probability.
- **Manual Video File Upload & Review:** Drag-and-drop video files (`.mp4`, `.webm`, `.mov`, `.avi`) or paste public video URLs for multi-frame filmstrip analysis.
- **Persistent Scan History:** Track all tested videos with verdicts, confidence scores, thumbnails, search, filters, and JSON export.
- **Dual Engine Architecture:** Works out-of-the-box with BitMind Video Oracle API and supports custom in-house REST deepfake video models.

---

## Project Structure

```text
Video_Deepfake_Detector_Extension/
├── manifest.json
├── README.md
├── assets/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   ├── icon128.png
│   └── test-frame.png
├── backend/
│   ├── background.js
│   └── providers/
│       └── video-provider-engine.js
├── frontend/
│   ├── content.js
│   ├── overlay.css
│   ├── popup.html
│   ├── popup.css
│   ├── popup.js
│   ├── sidepanel.html
│   ├── sidepanel.css
│   ├── sidepanel.js
│   ├── options.html
│   ├── options.css
│   └── options.js
└── tests/
    └── video-provider-engine.test.cjs
```

---

## Key Features

### 1. Hover Over ANY Video on ANY Website
- Automatically locates `<video>` tags and video containers on all domains.
- Non-intrusive floating badge appears at the top-right corner of the video.
- Real-time states:
  - `[🔍 BitMind: Scan]` (Idle)
  - `[⚡ Analyzing video frames...]` (Scanning)
  - `[🚨 DEEPFAKE DETECTED • 97%]` (Synthetic Artifacts Detected)
  - `[✅ AUTHENTIC • 98%]` (Verified Genuine Recording)
  - `[⚠️ UNCERTAIN • 54%]` (Inconclusive)
- Expandable overlay card with confidence bars, model details, and quick side panel jump.
- Works even on complex players with overlay click-catchers using coordinate inspection.

### 2. Manual Video Upload & Studio
- Upload local video files up to 50MB.
- Interactive HTML5 video preview player.
- **Multi-frame Filmstrip Extractor:** Samples 5 representative keyframes (at 10%, 25%, 50%, 75%, 90% of duration) and analyzes each temporal segment.
- Full forensic metrics: synthetic score, detector model, analysis latency, video metadata, and raw JSON response.

### 3. Tested Videos History
- Persisted locally in `chrome.storage.local`.
- Real-time search across video titles, URLs, and filenames.
- Category filters: **All**, **Deepfakes**, **Authentic**, and **Uncertain**.
- Click any past scan to reload its full forensic report in the studio.
- One-click **Export JSON** and **Clear History**.

### 4. BitMind API Integration & Custom Models
- Direct integration with BitMind Oracle API:
  - Video endpoint: `https://api.bitmind.ai/oracle/v1/34/detect-video`
  - Keyframe endpoint: `https://api.bitmind.ai/oracle/v1/34/detect-image`
- Custom REST API connector with support for:
  - Bearer tokens, custom headers, or unauthenticated localhost servers.
  - Video transport modes: Multipart form-data, JSON with URL, JSON with Base64, raw binary.
  - Configurable JSON dot-path response mappings.

---

## Installation & Setup

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `Video_Deepfake_Detector_Extension` directory:
   ```
   c:\Users\Shubh\OneDrive\Desktop\Project\Video_Deepfake_Detector_Extension
   ```
5. Pin the **BitMind Video Deepfake Detector** to your toolbar.
6. Click the extension icon to open the popup:
   - Enter your **BitMind API Key** (obtainable from [app.bitmind.ai](https://app.bitmind.ai)).
   - Click **Save Key**, then **Test Key** to verify the connection.
7. Open any website with video content (e.g., YouTube, X/Twitter, Vimeo) and hover over a video to watch the detector in action!

---

## Running Automated Tests

Run the built-in unit tests to verify provider response normalization and configuration validation:

```bash
node Video_Deepfake_Detector_Extension/tests/video-provider-engine.test.cjs
```
