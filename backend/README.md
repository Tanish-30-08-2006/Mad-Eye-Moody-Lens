# Mad-Eye Moody Lens — Deepfake Detection & Heatmap Backend

FastAPI backend powered by pre-trained CNN architectures (`EfficientNet-B0` from FaceForensics++ / CIFAKE baseline), providing **real-time inference (< 150ms)**, **Grad-CAM attention heatmaps**, and **whole vs. partial image manipulation segmentation**.

---

## ⚡ Architecture & Features

- **Pre-trained CNN Backbone**:
  - Implements the EfficientNet-B0 CNN architecture with 2-way classification head (Real vs. Synthetic/Fake).
  - Target layer for Grad-CAM explainability: `model.features[-1]`.
  - Calibrated Error-Level Analysis (ELA) and spatial frequency residual analysis for fine-grained boundary anomaly detection.
- **Whole-Image vs. Partial Manipulation Segmentation**:
  - Tesselates the input into spatial patches and facial crops.
  - Generates a continuous spatial heatmap normalized to `[0.0, 1.0]` using Turbo/Jet thermal colormapping.
  - Classifies manipulation into:
    - `entire_image`: Uniform synthetic artifacts covering $\ge 55\%$ of canvas.
    - `partial`: Localized modification (e.g. face swap or inpainting) covering $4\% \dots 55\%$.
    - `authentic`: Natural sensor noise with $< 4\%$ anomalous area.
- **Interactive Heatmap Output**:
  - Base64 transparent RGBA overlay image (authentic regions remain transparent; AI-generated regions glow with thermal color).
  - Blended composite image for side-by-side or quick inspection.
  - Bounding boxes `[x, y, width, height]` pinpointing manipulated regions.

---

## 🚀 Quickstart

### 1. Environment Setup
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Run Server
```bash
python run.py --port 8000
```
Interactive Swagger API documentation will be available at: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 📡 API Endpoints

### 1. `POST /api/analyze` (Live Detection)
Fast lightweight response designed for the extension's live long-press trigger.
- **Request**: Multipart image file OR JSON `{"image_url": "..."}` / `{"image_base64": "..."}`
- **Response**:
  ```json
  {
    "is_ai_generated": true,
    "fake_probability": 0.892,
    "confidence_score": "89.2%",
    "verdict": "AI-GENERATED",
    "label": "AI-Generated Image",
    "manipulation_type": "fully_synthetic",
    "processing_time_ms": 112,
    "model_used": "EfficientNet-B0 (FaceForensics++ / CIFAKE CNN)"
  }
  ```

### 2. `POST /api/analyze-advanced` (Heatmap & Scope)
Comprehensive analysis with Grad-CAM heatmap, whole vs partial classification, and highlighted bounding boxes.
- **Response**:
  ```json
  {
    "is_ai_generated": true,
    "fake_probability": 0.914,
    "confidence_score": "91.4%",
    "verdict": "PARTIALLY MANIPULATED",
    "manipulation_scope": "partial",
    "scope_verdict": "Partially AI-Generated (24.3% affected)",
    "ai_area_percentage": 24.3,
    "heatmap_overlay_base64": "data:image/png;base64,...",
    "blended_image_base64": "data:image/png;base64,...",
    "highlighted_regions": [
      {
        "box": [120, 85, 90, 110],
        "label": "Face #1: AI-Manipulated",
        "fake_probability": 0.941,
        "is_ai": true,
        "description": "Facial region analysis via EfficientNet-B0 CNN (Confidence: 94.1%)"
      }
    ],
    "patch_grid": [[...]],
    "detailed_explanation": "Localized deepfake manipulation detected..."
  }
  ```

### 3. `GET /api/health`
Healthcheck probe returning model status and active compute device.

---

## 🧪 Running Unit Tests
```bash
source .venv/bin/activate
pytest -v
```
All unit tests verify endpoint status, multipart uploads, base64 payloads, heatmap generation, and schema parity.
