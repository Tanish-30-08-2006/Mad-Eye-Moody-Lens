"""Image prediction route."""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import JSONResponse

from app.core.exceptions import (
    FileTooLargeError,
    MediaProcessingError,
    ModelNotConfiguredError,
    UnsupportedFormatError,
)
from app.models.registry import registry
from app.models.schemas import (
    ImagePredictionResponse,
    Modality,
    PredictionStatus,
)
from app.services.history import history_store
from app.services.image import image_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["predict"])

IMAGE_MODEL_ID = "hybrid_xception_vit"


@router.post("/predict/image", response_model=ImagePredictionResponse)
async def predict_image(file: UploadFile = File(...)):
    data = await file.read()
    filename = file.filename or "upload"
    content_type = (file.content_type or "image/jpeg").split(";")[0].strip()

    # ── Validate ──────────────────────────────────────────────────────────────
    try:
        image_service.validate_upload(file, data)
    except FileTooLargeError as exc:
        return JSONResponse(status_code=413, content={"error": str(exc)})
    except UnsupportedFormatError as exc:
        return JSONResponse(status_code=415, content={"error": str(exc)})

    # ── Metadata ──────────────────────────────────────────────────────────────
    try:
        metadata = image_service.extract_metadata(data, filename, content_type)
    except MediaProcessingError as exc:
        return JSONResponse(status_code=422, content={"error": str(exc)})

    # ── Inference ─────────────────────────────────────────────────────────────
    try:
        adapter = registry.require(IMAGE_MODEL_ID)
    except KeyError:
        return JSONResponse(
            status_code=503,
            content={"error": f"Model '{IMAGE_MODEL_ID}' is not registered."},
        )

    temp_path = None
    try:
        suffix = "." + filename.rsplit(".", 1)[-1] if "." in filename else ".jpg"
        temp_path = image_service.save_temp(data, suffix)

        t0 = time.monotonic()
        preprocessed = adapter.preprocess(temp_path)
        raw_result = adapter.predict(preprocessed)
        processed = adapter.postprocess(raw_result)
        elapsed_ms = (time.monotonic() - t0) * 1000

        response = ImagePredictionResponse(
            model_id=IMAGE_MODEL_ID,
            status=PredictionStatus.SUCCESS,
            predicted_label=processed.get("predicted_label"),
            score=processed.get("score"),
            score_type=processed.get("score_type"),
            real_score=processed.get("real_score"),
            fake_score=processed.get("fake_score"),
            inference_time_ms=round(elapsed_ms, 2),
            metadata=metadata,
        )
        history_store.add(
            modality=Modality.IMAGE,
            filename=filename,
            status=PredictionStatus.SUCCESS,
            model_id=IMAGE_MODEL_ID,
        )
        return response

    except ModelNotConfiguredError as exc:
        history_store.add(
            modality=Modality.IMAGE,
            filename=filename,
            status=PredictionStatus.UNAVAILABLE,
            model_id=IMAGE_MODEL_ID,
        )
        return JSONResponse(
            status_code=503,
            content=ImagePredictionResponse(
                model_id=IMAGE_MODEL_ID,
                status=PredictionStatus.UNAVAILABLE,
                metadata=metadata,
                unavailable_reason=exc.message,
                error=exc.message,
            ).model_dump(),
        )
    except Exception as exc:
        logger.exception("Image inference error: %s", exc)
        return JSONResponse(
            status_code=500,
            content=ImagePredictionResponse(
                model_id=IMAGE_MODEL_ID,
                status=PredictionStatus.ERROR,
                metadata=metadata,
                error=str(exc),
            ).model_dump(),
        )
    finally:
        image_service.cleanup(temp_path)
