# Dependency Isolation Architecture

This document describes how to handle conflicting model requirements (e.g., PyTorch / Fairseq vs TensorFlow / Keras) without modifying the frontend or API contracts.

---

## 1. The Challenge

- **Audio Detector** (`SSL_Anti-spoofing`): Built on PyTorch, Torchaudio, and Fairseq (wav2vec 2.0 XLSR 300M).
- **Image/Video Detector** (`Hybrid-Xception-Vision-Transformer`): Built on TensorFlow / Keras (or a specific PyTorch + Timm version).
- Large ML libraries frequently have conflicting CUDA, C++ runtime, NumPy, or protobuf requirements.

---

## 2. Supported Isolation Architectures

### Option A: Unified Environment (Simplest)
If your installed versions of PyTorch and TensorFlow co-exist cleanly in your Python environment:
- Install both sets of requirements directly in the backend virtualenv:
  ```bash
  pip install torch torchaudio fairseq
  pip install tensorflow keras
  ```
- Set `AUDIO_MODEL_ENABLED=true` and `IMAGE_MODEL_ENABLED=true` in `backend/.env`.
- The FastAPI application loads both adapters in-process.

---

### Option B: Separate Worker Subprocess / Virtualenvs
If dependencies conflict, isolate the model runtimes without changing the frontend:

```
┌───────────────────────────────────────┐
│        React Frontend (Vite)          │
│        http://localhost:5173          │
└──────────────────┬────────────────────┘
                   │ /api/*
                   ▼
┌───────────────────────────────────────┐
│     FastAPI Gateway (Port 8000)       │
│  - Upload validation & metadata       │
│  - Video frame extraction             │
│  - History management                 │
│  - Model Registry                     │
└───────────┬───────────────┬───────────┘
            │               │
            ▼               ▼
┌──────────────────┐  ┌──────────────────┐
│ Audio Worker     │  │ Image/Video      │
│ (PyTorch Env)    │  │ (TF / Keras Env) │
│ Port 8001        │  │ Port 8002        │
└──────────────────┘  └──────────────────┘
```

1. **Audio Micro-worker** (`backend/workers/audio_worker.py`):
   - Runs in a venv with Python 3.9/3.10, PyTorch, Fairseq.
   - Exposes a minimal POST `/predict` endpoint.
   - In `SSLAntiSpoofingAdapter.predict()`, make an HTTP request to `http://localhost:8001/predict`.

2. **Image Micro-worker** (`backend/workers/image_worker.py`):
   - Runs in a venv with TensorFlow/Keras.
   - Exposes a minimal POST `/predict` endpoint.
   - In `HybridXceptionViTAdapter.predict()`, make an HTTP request to `http://localhost:8002/predict`.

3. **Frontend Impact**: Zero. The frontend only talks to the FastAPI Gateway on Port 8000.
