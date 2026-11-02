"""HTTP routes under ``/api/v1`` (design doc Section 4).

The first six endpoints are the frontend contract and behave exactly as in
Sprint 2. ``/ready``, ``/analyses/{id}``, ``/analyses/{id}/explanation``,
``DELETE /jobs/{id}`` and ``/metrics`` are additive.

Blocking work (database, Redis, waiting on Celery) runs in the thread pool so
the event loop only ever streams uploads.
"""

from __future__ import annotations

from fastapi import APIRouter, File, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.core.config import settings
from app.core.logging import bind_context
from app.core.ratelimit import check_rate_limit
from app.core.redis import get_redis
from app.core.storage import get_storage
from app.core.uploads import save_upload
from app.db.session import db_healthy
from app.schemas import AnalysisResult, ErrorBody, Explanation, JobStatus, ModelInfo
from app.services import dispatch, heartbeat, jobs, results

router = APIRouter(prefix="/api/v1")

ERRORS = {
    404: {"model": ErrorBody},
    413: {"model": ErrorBody},
    415: {"model": ErrorBody},
    422: {"model": ErrorBody},
    429: {"model": ErrorBody},
    503: {"model": ErrorBody},
    504: {"model": ErrorBody},
}


# ------------------------------------------------------------------- health
@router.get("/health", tags=["ops"])
def health() -> dict:
    """Liveness: the API process answers (container restart probe)."""
    return {"status": "ok"}


@router.get("/ready", tags=["ops"], responses={503: {"model": ErrorBody}})
def ready() -> JSONResponse:
    """Readiness: database, Redis, storage, and a worker with models loaded per queue."""
    checks: dict[str, object] = {"database": db_healthy(), "storage": get_storage().healthy()}
    try:
        checks["redis"] = bool(get_redis().ping())
        queues = heartbeat.ready_queues()
    except Exception:  # noqa: BLE001
        checks["redis"], queues = False, {}
    checks["workers"] = queues
    ok = (
        all(v is True for k, v in checks.items() if k != "workers")
        and bool(queues)
        and all(n > 0 for n in queues.values())
    )
    if ok:
        return JSONResponse({"status": "ready", "checks": checks})
    return JSONResponse({"error": "The service is not ready yet.", "checks": checks}, status_code=503)


@router.get("/models", response_model=list[ModelInfo], tags=["models"])
def list_models() -> list[dict]:
    """Model names and load state, built from worker heartbeats."""
    return heartbeat.models_view()


@router.get("/metrics", include_in_schema=False)
def metrics() -> Response:
    """Prometheus scrape endpoint; nginx blocks it from the outside."""
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


# ----------------------------------------------------------------- analysis
async def _analyse_sync(request: Request, file: UploadFile, kind: str) -> AnalysisResult:
    await run_in_threadpool(check_rate_limit, request, "fast")
    await run_in_threadpool(dispatch.ensure_capacity, dispatch.FAST)
    saved = await save_upload(file, kind)
    bind_context(media_type=kind)
    return await run_in_threadpool(dispatch.run_fast, saved)


@router.post("/analyze/image", response_model=AnalysisResult, tags=["analysis"], responses=ERRORS)
async def analyze_image(request: Request, file: UploadFile = File(...)) -> AnalysisResult:
    """AI-generated image check, plus the face check when a face is found."""
    return await _analyse_sync(request, file, "image")


@router.post("/analyze/audio", response_model=AnalysisResult, tags=["analysis"], responses=ERRORS)
async def analyze_audio(request: Request, file: UploadFile = File(...)) -> AnalysisResult:
    """Windowed synthetic-speech check (4 s windows)."""
    return await _analyse_sync(request, file, "audio")


@router.post("/analyze/video", response_model=JobStatus, status_code=202, tags=["analysis"], responses=ERRORS)
async def analyze_video(request: Request, file: UploadFile = File(...)) -> JobStatus:
    """Start a video job (202); poll GET /jobs/{job_id}."""
    await run_in_threadpool(check_rate_limit, request, "video")
    await run_in_threadpool(dispatch.ensure_capacity, dispatch.VIDEO)
    saved = await save_upload(file, "video")
    return await run_in_threadpool(dispatch.start_video, saved)


# --------------------------------------------------------------------- jobs
@router.get("/jobs/{job_id}", response_model=JobStatus, tags=["jobs"], responses={404: {"model": ErrorBody}})
def get_job(job_id: str, request: Request) -> JobStatus:
    check_rate_limit(request, "poll")
    return jobs.get_job(job_id)


@router.delete("/jobs/{job_id}", status_code=204, tags=["jobs"], responses={404: {"model": ErrorBody}})
def cancel_job(job_id: str, request: Request) -> Response:
    check_rate_limit(request, "poll")
    dispatch.cancel_video(job_id)
    return Response(status_code=204)


# ---------------------------------------------------------------- analyses
@router.get(
    "/analyses/{analysis_id}", response_model=AnalysisResult, tags=["analyses"], responses={404: {"model": ErrorBody}}
)
def get_analysis(analysis_id: str, request: Request) -> AnalysisResult:
    """Re-fetch a stored result while it is within retention (7 days)."""
    check_rate_limit(request, "poll")
    return results.get_result(analysis_id)


@router.get(
    "/analyses/{analysis_id}/explanation",
    response_model=Explanation,
    tags=["analyses"],
    responses={404: {"model": ErrorBody}},
)
def get_explanation(analysis_id: str, request: Request) -> Explanation:
    """Grad-CAM heatmaps for the face model: attention + face boxes, never pixels."""
    check_rate_limit(request, "poll")
    return results.get_explanation(analysis_id, settings.face_model_id)
