"""FastAPI application for live deepfake detection and advanced heatmap analysis."""

from __future__ import annotations

import base64
import io
import time
from typing import Optional
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
import requests

from app.detector import detector
from app.schemas import (
    AdvancedScanResponse,
    AnalyzeRequest,
    LiveScanResponse,
)

app = FastAPI(
    title="Mad-Eye Moody Lens Live Deepfake Detection API",
    description="Real-time web tracking & advanced Grad-CAM heatmap deepfake analysis powered by pre-trained CNNs.",
    version="2.0.0",
)

# Enable CORS for Chrome extensions and any web origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_image_from_bytes(data: bytes) -> Image.Image:
    """Safely decodes raw bytes into a PIL Image."""
    try:
        buf = io.BytesIO(data)
        img = Image.open(buf)
        img.load()  # Ensure image is fully loaded into memory
        return img
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image format or corrupted bytes: {e}")


def _load_image_from_base64(b64_str: str) -> Image.Image:
    """Decodes data URL or raw base64 string into a PIL Image."""
    try:
        if "," in b64_str:
            b64_str = b64_str.split(",", 1)[1]
        decoded = base64.b64decode(b64_str)
        return _load_image_from_bytes(decoded)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode base64 image: {e}")


def _load_image_from_url(url: str) -> Image.Image:
    """Fetches an image from an external URL with safety timeout."""
    try:
        resp = requests.get(
            url,
            timeout=10,
            headers={"User-Agent": "MadEyeMoodyLens/2.0 (Deepfake Detection Bot)"},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Failed to fetch image from URL: HTTP {resp.status_code}")
        return _load_image_from_bytes(resp.content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error fetching remote image URL: {e}")


@app.get("/")
def root():
    return {
        "service": "Mad-Eye Moody Lens Live Deepfake Detection API",
        "version": "2.0.0",
        "status": "online",
        "endpoints": {
            "live_detection": "/api/analyze",
            "advanced_heatmap": "/api/analyze-advanced",
            "health": "/api/health",
            "models": "/api/models",
        },
    }


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "model_loaded": detector.is_loaded,
        "device": str(detector.device),
        "timestamp": time.time(),
    }


@app.get("/api/models")
def get_models():
    return {
        "primary_model": "EfficientNet-B0 CNN (FaceForensics++ / CIFAKE)",
        "features": [
            "Real-time <= 1.0s inference",
            "Grad-CAM explainability",
            "Spatial anomaly & Error-Level Analysis (ELA)",
            "Whole-image vs partial manipulation segmentation",
            "Interactive thermal heatmap rendering",
        ],
        "device": str(detector.device),
        "status": "ready",
    }


# -------------------------------------------------------------------------
# Live Detection Endpoint (Fast response for extension long-press tracking)
# -------------------------------------------------------------------------
@app.post("/api/analyze", response_model=LiveScanResponse)
async def analyze_image_endpoint(
    request: Request,
    file: Optional[UploadFile] = File(None),
):
    """
    Fast live analysis endpoint for long-press trigger (>1.0s).
    Accepts multipart file upload or JSON body with image_url / image_base64.
    """
    img: Optional[Image.Image] = None

    if file is not None:
        content = await file.read()
        img = _load_image_from_bytes(content)
    else:
        try:
            body = await request.json()
            payload = AnalyzeRequest(**body)
            if payload.image_base64:
                img = _load_image_from_base64(payload.image_base64)
            elif payload.image_url:
                img = _load_image_from_url(payload.image_url)
        except Exception:
            pass

    if img is None:
        raise HTTPException(status_code=400, detail="Must provide an image via multipart file upload or JSON payload.")

    return detector.analyze(img)


# -------------------------------------------------------------------------
# Advanced Analysis Endpoint (Heatmap, whole vs partial, region boxes)
# -------------------------------------------------------------------------
@app.post("/api/analyze-advanced", response_model=AdvancedScanResponse)
async def analyze_advanced_endpoint(
    request: Request,
    file: Optional[UploadFile] = File(None),
):
    """
    Advanced analysis endpoint providing:
    - Grad-CAM and spatial anomaly heatmap
    - Whole image vs partial manipulation classification
    - Percentage of manipulated area
    - Highlighting of AI-generated regions
    - Base64 overlay and blended preview images
    """
    img: Optional[Image.Image] = None

    if file is not None:
        content = await file.read()
        img = _load_image_from_bytes(content)
    else:
        try:
            body = await request.json()
            payload = AnalyzeRequest(**body)
            if payload.image_base64:
                img = _load_image_from_base64(payload.image_base64)
            elif payload.image_url:
                img = _load_image_from_url(payload.image_url)
        except Exception:
            pass

    if img is None:
        raise HTTPException(status_code=400, detail="Must provide an image via multipart file upload or JSON payload.")

    return detector.analyze_advanced(img)
