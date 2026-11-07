# Mad-Eye Moody Lens — Frontend Extension (Live Deepfake Tracking)

A modern browser extension (Manifest V3) that provides **live deepfake detection tracking** on any webpage with **long-press (> 1.0s) activation** and **interactive Grad-CAM thermal heatmaps**.

---

## 🌟 Key Features

1. **Live Long-Press Detection (> 1.0s)**:
   - Hold mouse or touch down on any image on any webpage for **&gt; 1.0 second**.
   - A visual HUD charging ring shows progress and prevents accidental clicks.
   - Pinned floating verdict badge appears right beside the image showing real-time AI probability.
2. **Advanced Analysis & Thermal Heatmap**:
   - Superimposes a Grad-CAM / spatial activation heatmap directly over the image.
   - **Opacity Slider (0% – 100%)** allows seamless comparison between original image and the heatmap.
   - Highlights exact manipulated regions with glowing bounding boxes and confidence tags.
   - **Side-by-Side & Overlay Views**.
3. **Whole vs. Partial AI Generation Detection**:
   - Categorizes manipulation scope:
     - `Entire Image is AI-Generated` (Diffusion / Midjourney / DALL-E)
     - `Partially AI-Generated` (Deepfake face swap / Inpainting)
     - `Authentic Image` (Camera sensor photo)
   - Computes the exact **AI Area Coverage %** (e.g., `24.3%` of pixels manipulated).
4. **Popup Dashboard**:
   - Connection status indicator to the local CNN backend (`http://localhost:8000`).
   - Drag-and-drop **Instant Test Sandbox** to test local images without browsing.
   - Scan history tracking previously scanned items.
5. **Interactive Demo Page (`demo/index.html`)**:
   - Self-contained test suite with 4 diverse benchmark samples (Fully synthetic, Face swap, Inpainted, and Authentic photo).

---

## 🚀 Installation & Setup

### 1. Load Extension in Google Chrome / Brave / Edge:
1. Open your browser and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `Mad-Eye-Moody-Lens/frontend` folder.
5. The **Mad-Eye Moody Lens** icon (👁️) will appear in your extension toolbar.

### 2. Verify Backend Connection:
Make sure the backend is running at `http://localhost:8000`:
```bash
cd ../backend
source .venv/bin/activate
python run.py --port 8000
```
Open the extension popup to verify the status dot turns **green (Online)**.

---

## 🧪 Testing with the Interactive Demo Page

Open [`frontend/demo/index.html`](file:///Users/vedant_shah/Mad-Eye-Moody-Lens/frontend/demo/index.html) in your browser:
```bash
open demo/index.html
```
- Click and hold down the mouse on any of the 4 test cards for **> 1.0 second**.
- Watch the circular charging ring fill up and reveal the live detection badge!
- Click **"🔍 Heatmap & Details"** to open the full Grad-CAM interactive modal.
