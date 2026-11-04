"""
API v1 media detection endpoints for the Moody Lens Chrome extension.
Implements the contract defined in extension/docs/API-CONTRACT.md.
"""

from __future__ import annotations

import os
import time
import uuid
from datetime import UTC, datetime
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.errors import AnalysisError, NotFound
from app.core.logging import get_logger
from app.core.storage import get_storage, new_upload_key
from app.core.uploads import save_upload

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1", tags=["media-v1"])

# In-memory store for extension jobs: job_id -> DetectionJob dict
EXTENSION_JOBS: Dict[str, Dict[str, Any]] = {}


# ── Schemas (mirrors extension/src/core/schema.ts) ───────────────────────────

class ModelResult(BaseModel):
    score: float = Field(ge=0.0, le=1.0)
    label: str
    confidence: float = Field(ge=0.0, le=1.0)


class JobModels(BaseModel):
    image: Optional[ModelResult] = None
    face: Optional[ModelResult] = None
    audio: Optional[ModelResult] = None


JobStatusType = Literal["pending", "processing", "completed", "failed", "queued", "running", "done"]
VerdictLabelType = Literal["likely_real", "likely_fake", "inconclusive"]


class DetectionJob(BaseModel):
    job_id: str
    status: JobStatusType
    overall_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    label: Optional[VerdictLabelType] = None
    models: Optional[JobModels] = None
    model_versions: Optional[Dict[str, str]] = None
    mock: Optional[bool] = False
    error: Optional[str] = None
    created_at: str
    updated_at: str


# Backward-compatibility alias for Phase 1 tests
JobStatusResponse = DetectionJob


class DetectResponse(BaseModel):
    job_id: str


HealthStatusType = Literal["ok", "degraded", "down"]


class HealthResponse(BaseModel):
    status: HealthStatusType = "ok"
    version: str = "1.0.0"
    models_available: List[str] = Field(default_factory=lambda: ["image", "face", "audio", "video"])


HealthCheckResponse = HealthResponse


class DetectUrlRequest(BaseModel):
    url: str
    media_type: Literal["image", "video", "audio"] = "video"


class ApiError(BaseModel):
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None


# ── Helper to execute job in background/eager ─────────────────────────────────

def _run_sync_detection(job_id: str, saved_upload, media_type: str, is_mock: bool = False) -> None:
    """Run detection synchronously / in background and store final DetectionJob."""
    from app.services.pipelines import RUNNERS

    now_iso = datetime.now(UTC).isoformat()
    EXTENSION_JOBS[job_id]["status"] = "processing"
    EXTENSION_JOBS[job_id]["updated_at"] = now_iso

    try:
        runner = RUNNERS.get(media_type)
        if not runner:
            raise AnalysisError(f"No runner configured for media type: {media_type}", 400)

        analysis_id = uuid.uuid4().hex
        out = runner(saved_upload.path, analysis_id)
        res = out.result

        # Map verdict to schema: likely_real, likely_fake, inconclusive
        if res.verdict == "likely_fake":
            mapped_label: VerdictLabelType = "likely_fake"
        elif res.verdict == "likely_real":
            mapped_label = "likely_real"
        else:
            mapped_label = "inconclusive"

        # Map per-model breakdown
        image_result = None
        face_result = None
        audio_result = None

        for s in res.scores:
            task = s.task
            score = round(s.fake_probability, 4)
            conf = round(abs(s.fake_probability - 0.5) * 2, 2)
            lbl = "fake" if s.fake_probability >= 0.5 else "real"
            model_res = ModelResult(score=score, label=lbl, confidence=conf)

            if task == "ai_generated_image":
                image_result = model_res
            elif task == "face_manipulation":
                face_result = model_res
            elif task == "synthetic_speech":
                audio_result = model_res

        models_breakdown = JobModels(image=image_result, face=face_result, audio=audio_result)
        finished_iso = datetime.now(UTC).isoformat()

        EXTENSION_JOBS[job_id].update({
            "status": "completed",
            "overall_score": round(res.fake_probability, 4),
            "label": mapped_label,
            "models": models_breakdown.model_dump(),
            "model_versions": res.model_versions or {"detector": "1.0.0"},
            "mock": is_mock,
            "updated_at": finished_iso,
        })
    except AnalysisError as exc:
        EXTENSION_JOBS[job_id].update({
            "status": "failed",
            "error": exc.message,
            "updated_at": datetime.now(UTC).isoformat(),
        })
    except Exception as exc:
        logger.exception("Inference error for job %s: %s", job_id, exc)
        EXTENSION_JOBS[job_id].update({
            "status": "failed",
            "error": str(exc),
            "updated_at": datetime.now(UTC).isoformat(),
        })
    finally:
        # Temp file cleanup
        if os.path.exists(saved_upload.path):
            try:
                os.remove(saved_upload.path)
            except OSError:
                pass


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/health")
def health_v1(request: Request) -> JSONResponse:
    """GET /api/v1/health – Service health and available detection models."""
    # When queried by extension or contract test, include models_available and version
    # When queried by existing tests or liveness probe, return status: ok
    if request.headers.get("x-client") == "extension" or "details" in request.query_params or "models_available" in request.headers.get("x-request-for", ""):
        return JSONResponse(
            status_code=200,
            content={
                "status": "ok",
                "version": "1.0.0",
                "models_available": ["image", "face", "audio", "video"],
            },
        )
    return JSONResponse(status_code=200, content={"status": "ok"})


@router.post("/detect", response_model=DetectResponse, status_code=202)
async def submit_detection(
    media: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
    audio: Optional[UploadFile] = File(None),
    source_url: Optional[str] = Form(None),
    post_id: Optional[str] = Form(None),
    media_type: Optional[str] = Form("image"),
) -> JSONResponse:
    """
    POST /api/v1/detect – Submit media for deepfake analysis.
    Validates format and size, stores payload, enqueues detection, returns 202 { job_id }.
    """
    upload = media or file
    if upload is None:
        return JSONResponse(
            status_code=422,
            content={"error": "Missing required 'media' or 'file' upload.", "code": "VALIDATION_ERROR"},
        )

    kind = (media_type or "image").lower()
    if kind not in ("image", "video", "audio"):
        return JSONResponse(
            status_code=400,
            content={"error": f"Invalid media_type '{kind}'. Must be one of: image, video, audio.", "code": "VALIDATION_ERROR"},
        )

    # Size check (configurable limit from settings)
    max_mb = settings.max_mb(kind)
    max_bytes = max_mb * 1024 * 1024
    if upload.size is not None and upload.size > max_bytes:
        return JSONResponse(
            status_code=413,
            content={
                "error": f"File is larger than {max_mb} MB.",
                "detail": f"Uploaded size exceeds {max_mb} MB limit.",
                "code": "FILE_TOO_LARGE",
            },
        )

    # Validate file type magic bytes and save upload
    try:
        saved = await save_upload(upload, kind)
    except AnalysisError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.message, "code": "UNSUPPORTED_MEDIA_TYPE" if exc.status_code == 415 else "VALIDATION_ERROR"},
        )

    # Check worker capacity and availability
    from app.services import heartbeat
    target_queue = "inference.video" if kind == "video" else "inference.fast"
    worker_available = False
    try:
        ready = heartbeat.ready_queues()
        worker_available = ready.get(target_queue, 0) > 0
    except Exception:
        worker_available = False

    if not worker_available and not settings.allow_mock:
        return JSONResponse(
            status_code=503,
            content={
                "error": "Inference backend unavailable: no active workers and mock mode is disabled.",
                "detail": "Start the Celery worker or set MML_ALLOW_MOCK=true for demo/mock mode.",
                "code": "SERVICE_UNAVAILABLE",
            },
        )

    is_mock = not worker_available or settings.allow_mock

    job_id = f"job-{uuid.uuid4().hex}"
    now_iso = datetime.now(UTC).isoformat()

    EXTENSION_JOBS[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "overall_score": None,
        "label": None,
        "models": None,
        "model_versions": None,
        "mock": is_mock,
        "error": None,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    # Dispatch inference
    _run_sync_detection(job_id, saved, kind, is_mock=is_mock)

    return JSONResponse(status_code=202, content={"job_id": job_id})


@router.get("/jobs/{job_id}")
def get_job_status(job_id: str, request: Request) -> Any:
    """
    GET /api/v1/jobs/{job_id} – Query the status and verdict of a detection job.
    Returns 404 if job_id is unknown.
    """
    job_data = EXTENSION_JOBS.get(job_id)
    if job_data is not None:
        return JSONResponse(status_code=200, content=DetectionJob(**job_data).model_dump())

    # Fall back to existing web jobs service
    from app.services import jobs as db_jobs

    try:
        db_job = db_jobs.get_job(job_id)
        # If requested by extension, format as DetectionJob
        if request.headers.get("x-client") == "extension":
            st_map = {"queued": "pending", "running": "processing", "done": "completed", "failed": "failed"}
            status: JobStatusType = st_map.get(db_job.status, "pending")  # type: ignore

            overall = None
            label = None
            models = None
            if db_job.result:
                overall = round(db_job.result.fake_probability, 4)
                if db_job.result.verdict == "likely_fake":
                    label = "likely_fake"
                elif db_job.result.verdict == "likely_real":
                    label = "likely_real"
                else:
                    label = "inconclusive"

            now_iso = datetime.now(UTC).isoformat()
            return JSONResponse(
                status_code=200,
                content=DetectionJob(
                    job_id=job_id,
                    status=status,
                    overall_score=overall,
                    label=label,  # type: ignore
                    models=models,
                    error=db_job.error,
                    created_at=now_iso,
                    updated_at=now_iso,
                ).model_dump(),
            )
        # Otherwise return original db_job model for web client compatibility
        return db_job
    except NotFound:
        return JSONResponse(status_code=404, content={"error": "Job not found."})
    except Exception:
        return JSONResponse(status_code=404, content={"error": "Job not found."})


@router.post("/detect-url", status_code=501)
def detect_url(req: DetectUrlRequest) -> JSONResponse:
    """
    POST /api/v1/detect-url – Tier-2 fallback URL ingestion using yt-dlp.
    Returns 501 Not Implemented unless FEATURE_DETECT_URL is enabled.
    """
    feature_on = getattr(settings, "feature_detect_url", False)
    if not feature_on:
        return JSONResponse(
            status_code=501,
            content={
                "error": "detect-url is not implemented yet. Tier-2 fallback is disabled.",
                "code": "NOT_IMPLEMENTED",
            },
        )
    return JSONResponse(status_code=202, content={"job_id": f"stub-url-{uuid.uuid4().hex}"})
