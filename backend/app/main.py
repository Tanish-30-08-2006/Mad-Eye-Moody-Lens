"""FastAPI application for live deepfake detection and advanced heatmap analysis."""

from __future__ import annotations

import base64
import io
import time
from typing import Optional
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
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
    """Fetches an image from an external URL or decodes data: URL directly."""
    if url.startswith("data:"):
        return _load_image_from_base64(url)

    try:
        resp = requests.get(
            url,
            timeout=10,
            headers={"User-Agent": "MadEyeMoodyLens/2.0 (Deepfake Detection Bot)"},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Failed to fetch image from URL: HTTP {resp.status_code}")
        return _load_image_from_bytes(resp.content)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error fetching remote image URL: {e}")


async def _extract_image_from_request(
    request: Request,
    file: Optional[UploadFile] = None,
) -> Image.Image:
    """
    Extracts and parses image from:
    1. UploadFile parameter
    2. Multipart form data
    3. JSON body with image_base64, image_url, url, or base64
    4. Raw binary payload
    """
    # 1. Direct UploadFile parameter
    if file is not None and file.filename:
        content = await file.read()
        if content:
            return _load_image_from_bytes(content)

    content_type = request.headers.get("content-type", "").lower()

    # 2. Form data (multipart or urlencoded)
    if "multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type:
        try:
            form = await request.form()
            form_file = form.get("file")
            if form_file and hasattr(form_file, "read"):
                content = await form_file.read()
                if content:
                    return _load_image_from_bytes(content)
            img_b64 = form.get("image_base64")
            if img_b64 and isinstance(img_b64, str):
                return _load_image_from_base64(img_b64)
            img_url = form.get("image_url")
            if img_url and isinstance(img_url, str):
                return _load_image_from_url(img_url)
        except Exception:
            pass

    # 3. JSON body
    try:
        body = await request.json()
        if isinstance(body, dict):
            b64 = body.get("image_base64") or body.get("base64") or body.get("image")
            if b64 and isinstance(b64, str):
                return _load_image_from_base64(b64)
            url = body.get("image_url") or body.get("url") or body.get("src")
            if url and isinstance(url, str):
                return _load_image_from_url(url)
    except Exception:
        pass

    # 4. Raw binary body fallback
    try:
        raw_body = await request.body()
        if raw_body and len(raw_body) > 32:
            return _load_image_from_bytes(raw_body)
    except Exception:
        pass

    raise HTTPException(status_code=400, detail="Must provide an image via multipart file upload or JSON payload.")


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
    img = await _extract_image_from_request(request, file)
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
    img = await _extract_image_from_request(request, file)
    return detector.analyze_advanced(img)
