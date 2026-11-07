"""
API v1 media detection endpoints for the Moody Lens Chrome extension.
Implements the contract defined in frontend/docs/API-CONTRACT.md. Every detection goes through
brain.get_brain(); nothing in this file touches model code (see the BRAIN-LINK comments).
"""

from __future__ import annotations

import hashlib
import os
import re
import uuid
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import store
from .brain import BrainError, BrainResult, BrainUnavailable, DetectionBrain, get_brain
from .brain.interface import MODEL_KEYS
from .host_compat import AnalysisError, NotFound, get_logger, save_upload, settings
from .services import url_resolver, video_prep
from .services.video_prep import VideoPrepError

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1", tags=["media-v1"])

# In-memory store for extension jobs: job_id -> DetectionJob dict
EXTENSION_JOBS: Dict[str, Dict[str, Any]] = {}

MAX_BATCH_IMAGES = 10

# Media kept for /explain, only when the brain can explain (see store.RetainedMedia).
RETAINED_MEDIA = store.RetainedMedia()

_SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")
_PHASH_RE = re.compile(r"^[0-9a-fA-F]{16}$")


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


class TimelineEntry(BaseModel):
    start: float = Field(ge=0.0)
    end: float = Field(ge=0.0)
    score: float = Field(ge=0.0, le=1.0)


class SignalEntry(BaseModel):
    kind: str
    text: str
    severity: Literal["info", "low", "medium", "high"]


class BatchItem(BaseModel):
    index: int = Field(ge=0)
    status: Literal["completed", "failed"]
    cache_key: Optional[str] = None
    overall_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    label: Optional[VerdictLabelType] = None
    models: Optional[JobModels] = None
    model_versions: Optional[Dict[str, str]] = None
    mock: Optional[bool] = None
    timeline: Optional[List[TimelineEntry]] = None
    signals: Optional[List[SignalEntry]] = None
    error: Optional[str] = None


class DetectionJob(BaseModel):
    job_id: str
    status: JobStatusType
    overall_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    label: Optional[VerdictLabelType] = None
    models: Optional[JobModels] = None
    model_versions: Optional[Dict[str, str]] = None
    mock: Optional[bool] = False
    # Video only: suspicion per time slice. Absent when the brain has no timeline.
    timeline: Optional[List[TimelineEntry]] = None
    # "Why this score" notes from the brain.
    signals: Optional[List[SignalEntry]] = None
    # sha256 of the scanned media; the extension echoes it back with feedback.
    cache_key: Optional[str] = None
    # Batch jobs only: one entry per uploaded image; the top-level fields are the most suspicious one.
    items: Optional[List[BatchItem]] = None
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
    # True when scans would be answered with demo/mock verdicts (no real workers).
    mock: Optional[bool] = None


HealthCheckResponse = HealthResponse


class DetectUrlRequest(BaseModel):
    url: str
    media_type: Literal["image", "video", "audio"] = "video"


class ApiError(BaseModel):
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None


class BrainCapabilities(BaseModel):
    image: bool
    face: bool
    audio: bool
    video: bool
    explain: bool


class BrainStatusResponse(BaseModel):
    name: str
    version: str
    capabilities: BrainCapabilities
    is_mock: bool
    healthy: bool


class FeedbackRequest(BaseModel):
    cache_key: str = Field(pattern=r"^[0-9a-fA-F]{64}$")
    verdict_label: VerdictLabelType
    user_label: Literal["looks_right", "looks_wrong"]
    note: Optional[str] = Field(default=None, max_length=500)


class ExplainRegionEntry(BaseModel):
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    w: float = Field(ge=0.0, le=1.0)
    h: float = Field(ge=0.0, le=1.0)
    score: float = Field(ge=0.0, le=1.0)
    note: str = ""


class ExplainResponse(BaseModel):
    job_id: str
    summary: str
    regions: List[ExplainRegionEntry] = Field(default_factory=list)
    mock: bool = False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(UTC).isoformat()


def _remove_quietly(path: Any) -> None:
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except OSError:
        pass


def _prep_error(exc: VideoPrepError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.message, "code": exc.code})


def _unavailable(exc: BrainUnavailable) -> JSONResponse:
    content: Dict[str, Any] = {"error": exc.message, "code": "SERVICE_UNAVAILABLE"}
    if exc.detail:
        content["detail"] = exc.detail
    return JSONResponse(status_code=503, content=content)


def _upload_error(exc: AnalysisError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.message, "code": "UNSUPPORTED_MEDIA_TYPE" if exc.status_code == 415 else "VALIDATION_ERROR"},
    )


def _too_large(max_mb: int) -> JSONResponse:
    return JSONResponse(
        status_code=413,
        content={"error": f"File is larger than {max_mb} MB.", "detail": f"Uploaded size exceeds {max_mb} MB limit.", "code": "FILE_TOO_LARGE"},
    )


def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while chunk := fh.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def _brain_id(brain: DetectionBrain) -> str:
    """Cache namespace: a demo verdict can never be served once a real brain is linked, or vice versa."""
    # BRAIN-LINK: describe
    info = brain.describe()
    return f"{info.name}@{info.version}|{'mock' if info.is_mock else 'real'}"


def _result_fields(result: BrainResult) -> Dict[str, Any]:
    """BrainResult -> the job fields shared by single jobs, batch items and the verdict cache."""
    models = {}
    for key in MODEL_KEYS:
        out = result.models.get(key)
        models[key] = asdict(out) if out is not None else None  # None = did not run
    return {
        "overall_score": round(result.overall_score, 4),
        "label": result.label,
        "models": JobModels(**models).model_dump(),
        "model_versions": result.model_versions or None,
        "mock": result.mock,
        "timeline": [asdict(p) for p in result.timeline] or None,
        "signals": [asdict(sig) for sig in result.signals] or None,
    }


def _analyse(brain: DetectionBrain, kind: str, path: str, audio_path: Optional[str]) -> BrainResult:
    if kind == "image":
        # BRAIN-LINK: analyze_image
        return brain.analyze_image(path)
    if kind == "video":
        # BRAIN-LINK: analyze_video (path is the muxed file; audio_path is the separate track when uploaded)
        return brain.analyze_video(path, audio_path)
    # BRAIN-LINK: analyze_audio
    return brain.analyze_audio(path)


def _register_job(**fields: Any) -> str:
    job_id = f"job-{uuid.uuid4().hex}"
    now = _now()
    EXTENSION_JOBS[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "overall_score": None,
        "label": None,
        "models": None,
        "model_versions": None,
        "mock": None,
        "error": None,
        "created_at": now,
        "updated_at": now,
        **fields,
    }
    return job_id


def _update_job(job_id: str, **fields: Any) -> None:
    EXTENSION_JOBS[job_id].update(updated_at=_now(), **fields)


def _cached_fields(brain: DetectionBrain, cache_key: str, phash: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """A previous verdict for the same bytes (or a near-identical picture); a cache failure is just a miss."""
    try:
        db = store.get_store()
        found = db.get_verdict(cache_key, _brain_id(brain))
        if found is None and phash:
            found = db.find_by_phash(phash, _brain_id(brain))
    except Exception:
        logger.exception("Verdict cache lookup failed")
        return None
    if found is not None:
        found.pop("created_at", None)
        found.pop("cache_key", None)
    return found


def _remember(brain: DetectionBrain, cache_key: str, kind: str, fields: Dict[str, Any], phash: Optional[str]) -> None:
    try:
        store.get_store().put_verdict(cache_key, _brain_id(brain), kind, fields, phash)
    except Exception:
        logger.exception("Verdict cache write failed")


def _run_analysis(job_id: str, brain: DetectionBrain, kind: str, path: str, audio_path: Optional[str], cache_key: str, phash: Optional[str]) -> None:
    """Runs the brain for one file and records the outcome on the job (never raises)."""
    _update_job(job_id, status="processing")
    try:
        result = _analyse(brain, kind, path, audio_path)
        fields = _result_fields(result)
        _update_job(job_id, status="completed", cache_key=cache_key, **fields)
        _remember(brain, cache_key, kind, fields, phash)
        # BRAIN-LINK: describe (explain needs the media later, so only explain-capable brains keep a short-lived copy)
        if brain.describe().capabilities.explain:
            RETAINED_MEDIA.keep(job_id, path)
    except BrainError as exc:
        _update_job(job_id, status="failed", error=exc.message)
    except Exception as exc:
        logger.exception("Inference error for job %s: %s", job_id, exc)
        _update_job(job_id, status="failed", error=str(exc))


def _run_batch(job_id: str, brain: DetectionBrain, paths: List[str]) -> None:
    """Analyses each image (cache first), then reports the most suspicious one as the job's headline."""
    _update_job(job_id, status="processing")
    items: List[Dict[str, Any]] = []
    for index, path in enumerate(paths):
        item: Dict[str, Any] = {"index": index, "status": "failed", "cache_key": None}
        try:
            key = _sha256_file(path)
            phash = store.phash_of(path)
            item["cache_key"] = key
            fields = _cached_fields(brain, key, phash)
            if fields is None:
                # BRAIN-LINK: analyze_image
                result = brain.analyze_image(path)
                fields = _result_fields(result)
                _remember(brain, key, "image", fields, phash)
            item.update(status="completed", **fields)
        except BrainError as exc:
            item["error"] = exc.message
        except Exception as exc:
            logger.exception("Inference error for batch item %s of %s: %s", index, job_id, exc)
            item["error"] = "Analysis failed for this image."
        items.append(item)

    done = [i for i in items if i["status"] == "completed"]
    if not done:
        _update_job(job_id, status="failed", items=items, error=str(items[0].get("error") or "No image could be analysed."))
        return
    top = max(done, key=lambda i: i["overall_score"])
    _update_job(
        job_id,
        status="completed",
        items=items,
        overall_score=top["overall_score"],
        label=top["label"],
        models=top["models"],
        model_versions=top["model_versions"],
        signals=top["signals"],
        # Never silent: one demo item makes the whole job demo.
        mock=any(i["mock"] for i in done),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/health")
def health_v1(request: Request) -> JSONResponse:
    """GET /api/v1/health – Service health and available detection models."""
    # When queried by extension or contract test, include models_available, version and the mock flag
    # When queried by existing tests or liveness probe, return status: ok
    if request.headers.get("x-client") == "extension" or "details" in request.query_params or "models_available" in request.headers.get("x-request-for", ""):
        try:
            mock = get_brain().describe().is_mock
        except BrainUnavailable:
            mock = True
        return JSONResponse(
            status_code=200,
            content={
                "status": "ok",
                "version": "1.0.0",
                "models_available": ["image", "face", "audio", "video"],
                "mock": mock,
            },
        )
    return JSONResponse(status_code=200, content={"status": "ok"})


@router.get("/brain/status", response_model=BrainStatusResponse)
def brain_status() -> JSONResponse:
    """GET /api/v1/brain/status – Which brain answers scans, and whether it is a demo."""
    try:
        brain = get_brain()
    except BrainUnavailable as exc:
        return _unavailable(exc)
    # BRAIN-LINK: describe, healthy
    info = brain.describe()
    return JSONResponse(
        status_code=200,
        content={
            "name": info.name,
            "version": info.version,
            "capabilities": asdict(info.capabilities),
            "is_mock": info.is_mock,
            "healthy": brain.healthy(),
        },
    )


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
    Validates format and size, runs the brain (verdict cache first), returns 202 { job_id }.
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
    if upload.size is not None and upload.size > max_mb * 1024 * 1024:
        return _too_large(max_mb)

    if audio is not None and kind != "video":
        return JSONResponse(
            status_code=400,
            content={"error": "The 'audio' part is only valid with media_type=video.", "code": "VALIDATION_ERROR"},
        )

    # Validate file type magic bytes and save upload
    try:
        saved = await save_upload(upload, kind)
    except AnalysisError as exc:
        return _upload_error(exc)

    # Everything below owns temp files; the finally block always removes them.
    workspace: Optional[video_prep.TempWorkspace] = None
    try:
        try:
            brain = get_brain(kind)
        except BrainUnavailable as exc:
            return _unavailable(exc)

        # The key hashes the uploaded media part only, so a repost hits the cache with or without the audio track.
        cache_key = _sha256_file(saved.path)
        phash = store.phash_of(saved.path) if kind == "image" else None
        cached = _cached_fields(brain, cache_key, phash)
        if cached is not None:
            job_id = _register_job(status="completed", cache_key=cache_key, **cached)
            return JSONResponse(status_code=202, content={"job_id": job_id})

        job_path: str = saved.path
        audio_path: Optional[str] = None
        if kind == "video":
            try:
                if audio is not None:
                    # Reddit video + separate audio: mux into ONE mp4 so single-file brains work unchanged.
                    workspace = video_prep.TempWorkspace()
                    audio_file = await video_prep.save_audio_part(audio, workspace)
                    audio_path = str(audio_file)
                    job_path = str(await run_in_threadpool(video_prep.combine, saved.path, audio_file, workspace))
                elif video_prep.ffmpeg_available():
                    # Enforce the duration cap on plain videos too (skipped when ffprobe is absent).
                    await run_in_threadpool(video_prep.enforce_duration_cap, saved.path)
            except VideoPrepError as exc:
                return _prep_error(exc)

        return await _start_job(brain, kind, job_path, audio_path, cache_key, phash)
    finally:
        _remove_quietly(saved.path)
        if workspace is not None:
            workspace.cleanup()


async def _start_job(brain: DetectionBrain, kind: str, path: str, audio_path: Optional[str], cache_key: str, phash: Optional[str]) -> JSONResponse:
    """Registers the job and runs the brain; the caller still owns (and deletes) the files."""
    job_id = _register_job(mock=None)
    await run_in_threadpool(_run_analysis, job_id, brain, kind, path, audio_path, cache_key, phash)
    return JSONResponse(status_code=202, content={"job_id": job_id})


@router.post("/detect/batch", response_model=DetectResponse, status_code=202)
async def submit_batch(media: List[UploadFile] = File(default=[])) -> JSONResponse:
    """
    POST /api/v1/detect/batch – Up to 10 images (repeat the `media` part) as ONE job.
    The job reports per-image results in `items`; the top-level fields describe the most suspicious image.
    """
    if not media:
        return JSONResponse(status_code=422, content={"error": "Missing required 'media' uploads.", "code": "VALIDATION_ERROR"})
    if len(media) > MAX_BATCH_IMAGES:
        return JSONResponse(
            status_code=400,
            content={"error": f"At most {MAX_BATCH_IMAGES} images per batch.", "code": "VALIDATION_ERROR"},
        )

    max_mb = settings.max_mb("image")
    if any(u.size is not None and u.size > max_mb * 1024 * 1024 for u in media):
        return _too_large(max_mb)

    saved_paths: List[str] = []
    try:
        for upload in media:
            try:
                saved_paths.append((await save_upload(upload, "image")).path)
            except AnalysisError as exc:
                return _upload_error(exc)
        try:
            brain = get_brain("image")
        except BrainUnavailable as exc:
            return _unavailable(exc)

        job_id = _register_job()
        await run_in_threadpool(_run_batch, job_id, brain, saved_paths)
        return JSONResponse(status_code=202, content={"job_id": job_id})
    finally:
        for path in saved_paths:
            _remove_quietly(path)


@router.get("/jobs/{job_id}")
def get_job_status(job_id: str, request: Request) -> Any:
    """
    GET /api/v1/jobs/{job_id} – Query the status and verdict of a detection job.
    Returns 404 if job_id is unknown.
    """
    job_data = EXTENSION_JOBS.get(job_id)
    if job_data is not None:
        return JSONResponse(status_code=200, content=DetectionJob(**job_data).model_dump())

    # Fall back to existing web jobs service (only exists with the host backend)
    try:
        from app.services import jobs as db_jobs
    except ImportError:
        return JSONResponse(status_code=404, content={"error": "Job not found."})

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


@router.post("/detect-url")
async def detect_url(req: DetectUrlRequest) -> JSONResponse:
    """
    POST /api/v1/detect-url – Tier-2 fallback: the server downloads a Reddit post's video with yt-dlp.
    Returns 501 unless FEATURE_DETECT_URL is enabled; only reddit.com permalinks are accepted.
    """
    if not url_resolver.feature_enabled():
        return JSONResponse(
            status_code=501,
            content={
                "error": "detect-url is not enabled. Set FEATURE_DETECT_URL=true to use the Tier-2 fallback.",
                "code": "NOT_IMPLEMENTED",
            },
        )

    if req.media_type != "video":
        return JSONResponse(
            status_code=400,
            content={"error": "detect-url only supports media_type=video.", "code": "VALIDATION_ERROR"},
        )
    if not url_resolver.is_reddit_permalink(req.url):
        return JSONResponse(
            status_code=400,
            content={"error": "Only reddit.com post links are accepted.", "code": "VALIDATION_ERROR"},
        )

    try:
        brain = get_brain("video")
    except BrainUnavailable as exc:
        return _unavailable(exc)

    workspace = video_prep.TempWorkspace()
    try:
        downloaded = await run_in_threadpool(url_resolver.download_reddit_video, req.url, workspace)
        cache_key = _sha256_file(str(downloaded))
        cached = _cached_fields(brain, cache_key)
        if cached is not None:
            job_id = _register_job(status="completed", cache_key=cache_key, **cached)
            return JSONResponse(status_code=202, content={"job_id": job_id})
        # Same duration/validity checks as an upload.
        if video_prep.ffmpeg_available():
            await run_in_threadpool(video_prep.enforce_duration_cap, downloaded)
        return await _start_job(brain, "video", str(downloaded), None, cache_key, None)
    except VideoPrepError as exc:
        return _prep_error(exc)
    finally:
        workspace.cleanup()


@router.get("/jobs/{job_id}/explain", response_model=ExplainResponse)
async def explain_job(job_id: str) -> JSONResponse:
    """GET /api/v1/jobs/{job_id}/explain – Where the brain looked; 501 unless the brain can explain."""
    try:
        brain = get_brain()
    except BrainUnavailable as exc:
        return _unavailable(exc)
    # BRAIN-LINK: describe
    if not brain.describe().capabilities.explain:
        return JSONResponse(
            status_code=501,
            content={"error": "The active detection brain does not provide explanations.", "code": "NOT_IMPLEMENTED"},
        )
    if job_id not in EXTENSION_JOBS:
        return JSONResponse(status_code=404, content={"error": "Job not found.", "code": "NOT_FOUND"})
    path = RETAINED_MEDIA.get(job_id)
    if path is None:
        return JSONResponse(
            status_code=410,
            content={"error": "The scanned media is no longer available for explanation.", "code": "EXPLAIN_EXPIRED"},
        )
    try:
        # BRAIN-LINK: explain
        result = await run_in_threadpool(brain.explain, path)
    except BrainError as exc:
        return JSONResponse(status_code=422, content={"error": exc.message, "code": "EXPLAIN_FAILED"})
    if result is None:
        return JSONResponse(status_code=501, content={"error": "No explanation available.", "code": "NOT_IMPLEMENTED"})
    body = ExplainResponse(job_id=job_id, summary=result.summary, regions=[asdict(r) for r in result.regions], mock=result.mock)
    return JSONResponse(status_code=200, content=body.model_dump())


@router.get("/verdicts/lookup", response_model=DetectionJob)
def lookup_verdict(sha256: Optional[str] = None, phash: Optional[str] = None) -> JSONResponse:
    """GET /api/v1/verdicts/lookup?sha256= – Previous verdict for identical media; 404 on a miss (no brain needed)."""
    if not sha256 or not _SHA256_RE.match(sha256):
        return JSONResponse(status_code=400, content={"error": "sha256 must be 64 hex characters.", "code": "VALIDATION_ERROR"})
    if phash is not None and not _PHASH_RE.match(phash):
        return JSONResponse(status_code=400, content={"error": "phash must be 16 hex characters.", "code": "VALIDATION_ERROR"})
    key = sha256.lower()
    try:
        # Cached verdicts are namespaced by brain, so a demo verdict is never served as a real one.
        found = _cached_fields(get_brain(), key, phash.lower() if phash else None)
    except BrainUnavailable:
        found = None
    if found is None:
        return JSONResponse(status_code=404, content={"error": "No cached verdict.", "code": "NOT_FOUND"})
    now = _now()
    job = DetectionJob(job_id=f"cached-{key[:16]}", status="completed", cache_key=key, created_at=now, updated_at=now, **found)
    return JSONResponse(status_code=200, content=job.model_dump())


@router.post("/feedback", status_code=201)
def submit_feedback(body: FeedbackRequest) -> JSONResponse:
    """POST /api/v1/feedback – Thumbs up/down on a verdict. Stores labels only: no media, no user identifiers."""
    store.get_store().add_feedback(body.cache_key.lower(), body.verdict_label, body.user_label, body.note)
    return JSONResponse(status_code=201, content={"ok": True})
