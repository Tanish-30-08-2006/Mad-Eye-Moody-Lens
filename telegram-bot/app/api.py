"""FastAPI Service for Deepfake Image Detection.

Exposes:
- GET /health
- POST /predict (Multipart form with file=@image.jpg)
"""

from __future__ import annotations

import io
import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from app.detector import BaseDetector, get_detector

load_dotenv()

BACKEND = os.getenv("MODEL_BACKEND", "hf")  # "hf", "custom_pt", or "stub"
HF_MODEL_NAME = os.getenv("HF_MODEL_NAME", "Organika/sdxl-detector")
CHECKPOINT_PATH = os.getenv("CHECKPOINT_PATH", "cifake_resnet18.pt")
DEVICE = os.getenv("DEVICE", "cpu")

detector: BaseDetector | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global detector
    print(f"Loading detector backend: {BACKEND} on {DEVICE}...")
    try:
        detector = get_detector(
            backend=BACKEND,
            model_name=HF_MODEL_NAME,
            checkpoint_path=CHECKPOINT_PATH,
            device=DEVICE,
        )
        detector.ensure_loaded()
        print(f"Detector [{detector.model_name}] ready.")
    except Exception as e:
        print(f"Warning: Failed to pre-load model: {e}")
        # In case weights are not downloaded yet, fallback to stub if desired
    yield


app = FastAPI(
    title="Mad-Eye Moody Lens Deepfake Detector API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "backend": BACKEND,
        "model": detector.model_name if detector else "not_loaded",
        "device": DEVICE,
    }


@app.post("/predict")
async def predict_image(file: UploadFile = File(...)) -> dict:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{file.content_type}'. Please upload an image file (JPEG, PNG, WEBP, etc.).",
        )

    if detector is None:
        raise HTTPException(status_code=503, detail="Detector model is not initialized.")

    try:
        content = await file.read()
        image = Image.open(io.BytesIO(content))
        result = detector.predict(image)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app.api:app", host="0.0.0.0", port=port, reload=True)

