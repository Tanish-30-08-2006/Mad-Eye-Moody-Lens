"""Audio prediction route."""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import JSONResponse

from app.core.exceptions import (
    FileTooLargeError,
    ModelNotConfiguredError,
    UnsupportedFormatError,
)
from app.models.registry import registry
from app.models.schemas import (
    AudioPredictionResponse,
    Modality,
    PredictionStatus,
)
from app.services.audio import audio_service
from app.services.history import history_store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["predict"])

AUDIO_MODEL_ID = "ssl_antispoof_audio"


@router.post("/predict/audio", response_model=AudioPredictionResponse)
async def predict_audio(file: UploadFile = File(...)):
    data = await file.read()
    filename = file.filename or "upload"
    content_type = (file.content_type or "audio/wav").split(";")[0].strip()

    # ── Validate ──────────────────────────────────────────────────────────────
    try:
        audio_service.validate_upload(file, data)
    except FileTooLargeError as exc:
        return JSONResponse(status_code=413, content={"error": str(exc)})
    except UnsupportedFormatError as exc:
        return JSONResponse(status_code=415, content={"error": str(exc)})

    # ── Metadata ──────────────────────────────────────────────────────────────
    metadata = audio_service.extract_metadata(data, filename, content_type)

    # ── Inference ─────────────────────────────────────────────────────────────
    try:
        adapter = registry.require(AUDIO_MODEL_ID)
    except KeyError:
        return JSONResponse(
            status_code=503,
            content={"error": f"Model '{AUDIO_MODEL_ID}' is not registered."},
        )

    temp_path = None
    try:
        suffix = "." + filename.rsplit(".", 1)[-1] if "." in filename else ".wav"
        temp_path = audio_service.save_temp(data, suffix)

        t0 = time.monotonic()
        preprocessed = adapter.preprocess(temp_path)
        raw_result = adapter.predict(preprocessed)
        processed = adapter.postprocess(raw_result)
        elapsed_ms = (time.monotonic() - t0) * 1000

        response = AudioPredictionResponse(
            model_id=AUDIO_MODEL_ID,
            status=PredictionStatus.SUCCESS,
            predicted_label=processed.get("predicted_label"),
            score=processed.get("score"),
            score_type=processed.get("score_type"),
            inference_time_ms=round(elapsed_ms, 2),
            metadata=metadata,
        )
        history_store.add(
            modality=Modality.AUDIO,
            filename=filename,
            status=PredictionStatus.SUCCESS,
            model_id=AUDIO_MODEL_ID,
        )
        return response

    except ModelNotConfiguredError as exc:
        history_store.add(
            modality=Modality.AUDIO,
            filename=filename,
            status=PredictionStatus.UNAVAILABLE,
            model_id=AUDIO_MODEL_ID,
        )
        return JSONResponse(
            status_code=503,
            content=AudioPredictionResponse(
                model_id=AUDIO_MODEL_ID,
                status=PredictionStatus.UNAVAILABLE,
                metadata=metadata,
                unavailable_reason=exc.message,
                error=exc.message,
            ).model_dump(),
        )
    except Exception as exc:
        logger.exception("Audio inference error: %s", exc)
        return JSONResponse(
            status_code=500,
            content=AudioPredictionResponse(
                model_id=AUDIO_MODEL_ID,
                status=PredictionStatus.ERROR,
                metadata=metadata,
                error=str(exc),
            ).model_dump(),
        )
    finally:
        audio_service.cleanup(temp_path)
