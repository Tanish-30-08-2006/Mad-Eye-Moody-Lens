"""
FastAPI application entry point.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.adapters.audio_ssl_antispoof import SSLAntiSpoofingAdapter
from app.adapters.image_hybrid_vit import HybridXceptionViTAdapter
from app.adapters.video_frame import VideoFrameAdapter
from app.api.routes import health, history, predict_audio, predict_image, predict_video
from app.core.config import settings
from app.core.exceptions import DeepfakeDetectionError
from app.core.logging import get_logger, setup_logging
from app.models.registry import registry

setup_logging(settings.app_log_level)
logger = get_logger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Multimodal Deepfake Detection Studio",
        description=(
            "Backend API for multimodal deepfake detection. "
            "Model adapters are registered at startup; actual inference "
            "requires separately installed checkpoints."
        ),
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Global error handler ──────────────────────────────────────────────────
    @app.exception_handler(DeepfakeDetectionError)
    async def deepfake_error_handler(request: Request, exc: DeepfakeDetectionError):
        return JSONResponse(
            status_code=500,
            content={"error": exc.message, "detail": exc.detail},
        )

    @app.exception_handler(Exception)
    async def generic_error_handler(request: Request, exc: Exception):
        logger.exception("Unhandled exception: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"error": "An unexpected error occurred.", "detail": str(exc)},
        )

    # ── Register model adapters ───────────────────────────────────────────────
    image_adapter = HybridXceptionViTAdapter()
    audio_adapter = SSLAntiSpoofingAdapter()
    video_adapter = VideoFrameAdapter(image_adapter=image_adapter)

    registry.register(image_adapter)
    registry.register(audio_adapter)
    registry.register(video_adapter)

    # Attempt to load configured models (no-op if checkpoints are missing)
    for adapter in registry.all_adapters():
        try:
            adapter.load()
        except Exception as exc:
            logger.warning("Adapter '%s' load() failed: %s", adapter.model_id, exc)

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(health.router)
    app.include_router(predict_image.router)
    app.include_router(predict_audio.router)
    app.include_router(predict_video.router)
    app.include_router(history.router)

    @app.get("/")
    async def root():
        return {"message": "Multimodal Deepfake Detection Studio API", "docs": "/api/docs"}

    logger.info(
        "Application started. Configured models: %d / %d",
        registry.configured_count(),
        len(registry.all_adapters()),
    )
    return app


app = create_app()
