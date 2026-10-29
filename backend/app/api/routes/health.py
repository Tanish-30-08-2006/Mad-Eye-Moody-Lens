"""Health and model status routes."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.models.registry import registry
from app.models.schemas import HealthResponse, ModelListResponse, ModelInfo

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        version="1.0.0",
        models_configured=registry.configured_count(),
        models_unavailable=registry.unavailable_count(),
    )


@router.get("/models", response_model=ModelListResponse)
async def list_models():
    return registry.list_response()


@router.get("/models/{model_id}", response_model=ModelInfo)
async def get_model(model_id: str):
    try:
        adapter = registry.require(model_id)
    except KeyError:
        return JSONResponse(
            status_code=404,
            content={"error": f"Model '{model_id}' not found."},
        )
    return adapter.get_info()
