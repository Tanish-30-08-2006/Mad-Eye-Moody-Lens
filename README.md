# Mad-Eye Moody Lens 👁️ — Live Deepfake Tracking & Heatmap System

[![Branch](https://img.shields.io/badge/branch-vedant--dev-00d2ff.svg)](https://github.com/Tanish-30-08-2006/Mad-Eye-Moody-Lens/tree/vedant-dev)
[![Engine](https://img.shields.io/badge/CNN-EfficientNet--B0%20%7C%20CIFAKE-brightgreen.svg)]()
[![Backend](https://img.shields.io/badge/FastAPI-2.0-009688.svg)]()
[![Extension](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue.svg)]()

> **Sprint 3 Software Engineering Extension**: Real-time live deepfake detection tracking on web pages via **long-press (> 1.0s)**, powered by pre-trained CNN models with **Grad-CAM heatmaps** and **whole-image vs. partial manipulation segmentation**.

---

## 📑 Project Structure

```
Mad-Eye-Moody-Lens/
├── backend/                  # FastAPI server with pre-trained CNNs & Grad-CAM
│   ├── app/
│   │   ├── api.py / main.py  # Endpoints: /api/analyze & /api/analyze-advanced
│   │   ├── detector.py       # EfficientNet-B0 CNN inference & Grad-CAM engine
│   │   ├── heatmap.py        # Heatmap colormap, patch analysis & segmentation
│   │   └── schemas.py        # Pydantic contract models
│   ├── tests/                # Pytest unit tests for API & inference
│   ├── requirements.txt      # Python dependencies
│   ├── run.py                # Standalone backend server launcher
│   └── README.md             # Backend setup & API reference
│
├── frontend/                 # Manifest V3 Chrome Extension & Demo UI
│   ├── manifest.json         # Extension Manifest V3 configuration
│   ├── background.js         # Service worker handling off-origin fetches & context menu
│   ├── content/
│   │   ├── content.js        # Long-press (>1.0s) tracking & in-page HUD overlay
│   │   └── content.css       # HUD charging ring, floating badges & modal styling
│   ├── popup/
│   │   ├── popup.html        # Extension popup dashboard & settings
│   │   ├── popup.js          # Live status ping, dropzone test sandbox & scan history
│   │   └── popup.css         # Modern dark-mode UI
│   ├── demo/
│   │   └── index.html        # Interactive test page with benchmark samples
│   ├── icons/                # Extension icon assets (16, 32, 48, 128 px)
│   └── README.md             # Extension installation & user guide
│
├── data_analysis/            # CIFAKE dataset analysis & CNN training notebooks
└── functional-ui-models-backend/  # Sprint 2 production microservices reference
```

---

## ⚡ Core Software Engineering Features

### 1. ⏱️ Live Long-Press Detection Tracking (> 1.0s)
- **Universal In-Page Tracking**: Runs on any webpage (`<all_urls>`) across standard `<img>`, `<picture>`, and background image elements.
- **HUD Charging Ring Indicator**: When the user presses down on an image, a circular HUD progress ring appears at the cursor, smoothly charging up over **1.0 second**.
- **Accidental Click Prevention**: Releasing the mouse or scrolling before 1.0s cancels the action cleanly.
- **Floating Verdict Badge**: Once 1.0s elapses, the image is sent to the CNN backend, rendering an instant verdict pill directly pinned to the image (e.g., `🤖 94.2% AI-GENERATED` or `🌿 97.8% REAL`).

### 2. 🗺️ Advanced Grad-CAM Heatmap Analysis
- **Attention Heatmap Overlay**: Computes gradient-weighted class activations (Grad-CAM) from the final convolutional block of the EfficientNet-B0 CNN.
- **Interactive Opacity Slider (0% – 100%)**: Users can smoothly transition between the raw image and the thermal heatmap overlay.
- **Side-by-Side & Overlay Modes**: Instant toggle to inspect side-by-side comparisons or direct overlay.

### 3. 🔍 Whole-Image vs. Partial Manipulation Segmentation
- Accurately determines if the **entire image is synthetic** vs. if **only localized regions** were manipulated:
  - **`Entire Image is AI-Generated`**: Uniform generative diffusion artifacts covering $\ge 55\%$ of the canvas (e.g., Stable Diffusion, Midjourney, DALL-E).
  - **`Partially AI-Generated`**: Localized face swap or inpainting covering $4\% \dots 55\%$ of the image area, with surrounding regions retaining authentic camera sensor noise.
  - **`Authentic Image`**: Natural optical sensor noise with $< 4\%$ anomalous pixels.
- **Manipulated Region Highlighting**: Automatically generates glowing bounding boxes with confidence tags around manipulated faces or synthetic hotspots.

---

## 🚀 Quickstart Guide

### Step 1: Start the Backend Server
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py --port 8000
```
*API docs available at [http://localhost:8000/docs](http://localhost:8000/docs).*

### Step 2: Load the Chrome Extension
1. Open Google Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in upper right).
3. Click **Load unpacked** and select the [`Mad-Eye-Moody-Lens/frontend`](frontend/) directory.
4. The Moody Lens extension icon (👁️) will appear in your browser bar.

### Step 3: Test on the Interactive Demo Page
Open [`frontend/demo/index.html`](frontend/demo/index.html) in your browser:
```bash
open frontend/demo/index.html
```
- Click and **HOLD** your mouse button on any image for **> 1.0s**.
- Watch the HUD ring trigger and display the live verdict badge.
- Click **"🔍 Heatmap & Details"** to open the full Grad-CAM interactive modal.

---

## 🧪 Testing & Verification

Run the automated backend test suite:
```bash
cd backend
source .venv/bin/activate
pytest -v
```
All unit tests verify live detection endpoints, advanced heatmap generation, base64 data encoding, and whole-vs-partial segmentation.

---

## 📜 Branch Information
This branch is **`vedant-dev`**, created off `vishwam-dev`. All new feature implementations, frontend extension code, backend API services, and test suites are contained within this branch.
