# IT-314-Group-35 - Multimodal Deepfake Detection Studio

A modular, full-stack, local-first web application designed for multimodal deepfake detection across **Image**, **Audio**, and **Video**.

Built with **FastAPI**, **React 18**, **Vite**, **TypeScript**, and **Tailwind CSS**.

---

## Architecture Overview

```
                      ┌──────────────────────────────────────┐
                      │    React + Vite Frontend (UI)        │
                      │       http://localhost:5173          │
                      └──────────────────┬───────────────────┘
                                         │ /api/*
                                         ▼
                      ┌──────────────────────────────────────┐
                      │    FastAPI Application (Port 8000)   │
                      │  - Pydantic Validation & Schemas     │
                      │  - In-Memory Safe History Store      │
                      │  - Media Decoding & Frame Sampling   │
                      │  - Central Model Registry            │
                      └──────────────┬───┬───┬───────────────┘
                                     │   │   │
                   ┌─────────────────┘   │   └────────────────┐
                   ▼                     ▼                    ▼
      ┌─────────────────────┐  ┌──────────────────┐  ┌────────────────────┐
      │ Hybrid Xception-ViT │  │ SSL Anti-Spoofing│  │ Video Frame Router │
      │   (Image Adapter)   │  │ (Audio Adapter)  │  │(Reuses Image Model)│
      └─────────────────────┘  └──────────────────┘  └────────────────────┘
```

### Core Design Principles
1. **Model-Agnostic Core**: The entire web application, UI, media pipelines, frame extraction, metadata inspection, and API routes start and function cleanly without requiring pretrained weights or heavy deep learning dependencies.
2. **Adapter Pattern**: Each detector conforms to `BaseModelAdapter` (`load`, `health_check`, `preprocess`, `predict`, `postprocess`, `explain`). Adding weights requires editing only the adapter, never the API routes or frontend.
3. **No Fabricated Inference**: If a model checkpoint is absent, the backend reports `status: "unavailable"` with a clear explanation. It never invents fake scores or random labels.
4. **Independent Visual & Audio Pipelines for Video**: Videos can extract frames and display timestamps even before visual models are plugged in; audio tracks are extracted and analysed independently.
5. **Safe Media Processing**: Uploads are validated by header + decoding, stored in randomized temporary files, and cleaned up immediately after inference.

---

## Quick Start Guide

### Prerequisites
- Python 3.10+
- Node.js 18+ (with `npm` or `pnpm`)

---

### Step 1: Clone and Configure Environment

```bash
# Clone or navigate to the project directory
cd c:\study\softpro

# Create environment file from template
cp .env.example backend/.env
```

The default `.env` starts the application in **local mode** with zero ML weights required:
```ini
AUDIO_MODEL_ENABLED=false
IMAGE_MODEL_ENABLED=false
```

---

### Step 2: Start the Backend (FastAPI)

#### Windows:
Using the included batch script:
```cmd
run_backend.bat
```
Or manually in terminal:
```cmd
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

#### Linux / macOS:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Backend API Swagger docs will be accessible at: **http://127.0.0.1:8000/api/docs**

---

### Step 3: Start the Frontend (React + Vite)

#### Windows:
Using the included batch script:
```cmd
run_frontend.bat
```
Or manually in terminal:
```cmd
cd frontend
npm install
npm run dev
```

#### Linux / macOS:
```bash
cd frontend
npm install
npm run dev
```

Open your browser at: **http://localhost:5173**

---

## Running the Automated Test Suite

Run backend infrastructure tests without any ML models:
```bash
cd backend
python -m pytest tests/ -v
```

Tests verify:
- Health & Model registry endpoints.
- Proper `503 / unavailable` responses without fabricated predictions.
- Image format validation & metadata extraction.
- Audio format validation & mutagen metadata inspection.
- Video duration, frame sampling, and metadata inspection.
- History recording and limit parameters.
- Model adapters contract compliance.

---

## How to Add Pretrained Models Later

Once you are ready to connect your pretrained model checkpoints, follow these exact step-by-step procedures. **No frontend code changes are needed.**

---

### A. SSL Anti-Spoofing (Audio Model)

**Source Repository**: [TakHemlata/SSL_Anti-spoofing](https://github.com/TakHemlata/SSL_Anti-spoofing)  
**Target Architecture**: wav2vec 2.0 XLSR 300M

1. **Clone repository into backend vendors**:
   ```bash
   git clone https://github.com/TakHemlata/SSL_Anti-spoofing backend/vendor/SSL_Anti-spoofing
   ```
2. **Install model dependencies**:
   ```bash
   pip install torch torchaudio fairseq soundfile
   ```
   *(Note: If dependencies conflict with other libraries, refer to `docs/ISOLATION.md` for running in a dedicated worker process).*
3. **Place your checkpoint**:
   Save your `.pth` checkpoint file (e.g. `backend/weights/ssl_antispoof.pth`).
4. **Update `backend/.env`**:
   ```ini
   AUDIO_MODEL_ENABLED=true
   SSL_ANTISPOOF_CHECKPOINT=C:/study/softpro/backend/weights/ssl_antispoof.pth
   ```
5. **Connect the model adapter (`backend/app/adapters/audio_ssl_antispoof.py`)**:
   - In `load()`: Instantiate the `Model` class from the cloned repo and load weights using `torch.load()`.
   - In `preprocess(raw_input)`: Load audio waveform at 16 kHz mono.
   - In `predict(preprocessed)`: Execute model inference.
   - In `postprocess(raw_result)`: Map logits (index 0 = real/bonafide, index 1 = spoof) to probabilities.
6. **Verify**:
   Restart the backend. The **Models & Configuration** page will automatically show **SSL Anti-Spoofing** as `Ready`.

---

### B. Hybrid Xception + Vision Transformer (Image Model)

**Source Repository**: [tahangz/Hybrid-Xception-Vision-Transformer-Deepfake-Detection](https://github.com/tahangz/Hybrid-Xception-Vision-Transformer-Deepfake-Detection)

1. **Copy model definition**:
   Clone or copy the architecture definitions from the repository into `backend/vendor/hybrid_xception_vit/`.
2. **Install model dependencies**:
   ```bash
   pip install tensorflow keras
   # or the specific PyTorch equivalent required by the repository
   ```
3. **Place your checkpoint**:
   Save your checkpoint file (e.g. `backend/weights/hybrid_vit.h5` or `.pth`).
4. **Update `backend/.env`**:
   ```ini
   IMAGE_MODEL_ENABLED=true
   HYBRID_VIT_CHECKPOINT=C:/study/softpro/backend/weights/hybrid_vit.h5
   ```
5. **Connect the model adapter (`backend/app/adapters/image_hybrid_vit.py`)**:
   - In `load()`: Load the model and weights.
   - In `preprocess(raw_input)`: Apply exact image normalisation, target resolution, and color ordering.
   - In `predict(preprocessed)`: Run the model forward pass.
   - In `postprocess(raw_result)`: Output `score`, `real_score`, `fake_score`, and `predicted_label` ('real' vs 'fake').
6. **Verify**:
   Restart backend. The **Models & Configuration** page will show **Hybrid Xception-ViT** as `Ready`.

---

### C. Video Detection (Frame & Optional Audio Pipeline)

The video pipeline (`backend/app/adapters/video_frame.py` and `backend/app/services/video.py`) **automatically reuses the registered Image Model** adapter!

1. Once the **Hybrid Xception-ViT** image adapter is configured, video frame detection becomes active immediately without any extra setup.
2. In the Video Detection page:
   - Videos are uploaded and validated.
   - Frames are sampled uniformly (or by interval) and displayed in the frame gallery.
   - Each frame is passed to the image detector.
   - An overall video verdict is computed based on frame scores.
3. If the **SSL Anti-Spoofing** audio model is also configured, checking "Analyse audio track" extracts the video's audio track and runs voice spoof detection concurrently.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health and configured/unavailable model counts |
| `GET` | `/api/models` | List all models, readiness status, and configuration details |
| `GET` | `/api/models/{id}` | Detailed info and instructions for a specific model |
| `POST` | `/api/predict/image` | Validate image and run deepfake detection |
| `POST` | `/api/predict/audio` | Validate audio and run voice spoof detection |
| `POST` | `/api/predict/video` | Extract frames, video metadata, and run frame/audio inference |
| `GET` | `/api/frames/{name}` | Serve temporarily extracted video frames |
| `GET` | `/api/history` | Retrieve recent analysis history |

---

## License & Research Use
This project is intended for research, academic, and testing purposes in synthetic media detection.
