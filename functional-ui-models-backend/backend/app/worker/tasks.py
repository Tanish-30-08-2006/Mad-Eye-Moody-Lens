"""Celery tasks: the only code that touches uploads after the API stores them.

Contract with the API
    analyze_fast  -> {"ok": True, "result": AnalysisResult}  or
                     {"ok": False, "error": <user message>, "status": <http code>}
                     (errors travel as data, not pickled exceptions, so the API
                     can return the exact status code and message)
    analyze_video -> writes job state to Redis/PostgreSQL; the browser polls.

Retries happen only for infrastructure failures (Redis, database, storage);
an ``AnalysisError`` or a timeout never retries. The upload is deleted when
the task finishes for good – success, user error or final failure – never
before a retry that still needs it.
"""

from __future__ import annotations

import os
import uuid
from typing import Any

import redis
from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy.exc import OperationalError

from app.core.config import settings
from app.core.errors import INTERNAL_ERROR_MESSAGE, AnalysisError, Cancelled
from app.core.logging import bind_context, clear_context, get_logger
from app.core.metrics import FAILURES, VERDICTS
from app.core.storage import get_storage
from app.services import jobs, results
from app.services.pipelines import RUNNERS
from app.worker.celery_app import celery_app

log = get_logger(__name__)

# Failures worth retrying: the same input will very likely succeed next time.
RETRYABLE = (redis.ConnectionError, redis.TimeoutError, OperationalError, ConnectionError)
RETRY_COUNTDOWNS = (5, 20)


def _local_copy(upload_key: str) -> str:
    os.makedirs(settings.tmp_dir, exist_ok=True)
    path = os.path.join(settings.tmp_dir, f"work-{uuid.uuid4().hex}")
    get_storage().get_to_file(upload_key, path)
    return path


def _cleanup(upload_key: str, local_path: str | None) -> None:
    """Privacy guarantee: no media survives the task (design doc Section 7)."""
    try:
        get_storage().delete(upload_key)
    except Exception:  # noqa: BLE001 – the hourly sweep is the safety net
        log.warning("upload_delete_failed", exc_info=True)
    if local_path:
        for p in (local_path, local_path + ".wav"):
            if os.path.exists(p):
                os.remove(p)


def _final_attempt(task: Any) -> bool:
    return task.request.retries >= len(RETRY_COUNTDOWNS)


# --------------------------------------------------------------------- fast
@celery_app.task(
    name="mml.analyze_fast",
    bind=True,
    soft_time_limit=settings.fast_soft_time_limit_s,
    time_limit=settings.fast_time_limit_s,
)
def analyze_fast(self, media_type: str, upload_key: str, analysis_id: str, request_id: str | None = None) -> dict:
    """Image or audio analysis; the API waits on this result (≤ MML_SYNC_TIMEOUT_S)."""
    bind_context(request_id=request_id, analysis_id=analysis_id, media_type=media_type)
    local: str | None = None
    finished = True
    try:
        local = _local_copy(upload_key)
        out = RUNNERS[media_type](local, analysis_id)
        results.save_output(out)
        VERDICTS.labels(media_type, out.result.verdict).inc()
        log.info("analysis_done", verdict=out.result.verdict, ms=out.result.processing_ms, explained=len(out.heatmaps))
        return {"ok": True, "result": out.result.model_dump(mode="json")}
    except AnalysisError as exc:
        FAILURES.labels(media_type, "user_error").inc()
        return {"ok": False, "error": exc.message, "status": exc.status_code}
    except SoftTimeLimitExceeded:
        FAILURES.labels(media_type, "timeout").inc()
        return {"ok": False, "error": "The analysis took too long. Try a smaller file.", "status": 504}
    except RETRYABLE as exc:
        if not _final_attempt(self):
            finished = False
            raise self.retry(exc=exc, countdown=RETRY_COUNTDOWNS[self.request.retries]) from exc
        FAILURES.labels(media_type, "infrastructure").inc()
        log.exception("analysis_failed_infrastructure")
        return {"ok": False, "error": INTERNAL_ERROR_MESSAGE, "status": 500}
    except Exception:
        FAILURES.labels(media_type, "internal").inc()
        log.exception("analysis_failed")
        return {"ok": False, "error": INTERNAL_ERROR_MESSAGE, "status": 500}
    finally:
        if finished:
            _cleanup(upload_key, local)
        elif local and os.path.exists(local):
            os.remove(local)  # keep the stored upload for the retry, drop the local copy
        clear_context()


# -------------------------------------------------------------------- video
@celery_app.task(
    name="mml.analyze_video",
    bind=True,
    soft_time_limit=settings.video_soft_time_limit_s,
    time_limit=settings.video_time_limit_s,
)
def analyze_video(self, job_id: str, upload_key: str, analysis_id: str, request_id: str | None = None) -> None:
    """Video job: frames (progress 0 -> 1), audio track, Grad-CAM, then done."""
    bind_context(request_id=request_id, job_id=job_id, analysis_id=analysis_id, media_type="video")
    local: str | None = None
    finished = True
    reporter = jobs.ProgressReporter(job_id)
    try:
        if reporter.cancelled():
            raise Cancelled()
        jobs.mark_running(job_id)
        local = _local_copy(upload_key)
        out = RUNNERS["video"](
            local, analysis_id, progress=reporter.progress, stage=reporter.stage, cancelled=reporter.cancelled
        )
        results.save_output(out)
        jobs.mark_done(job_id)
        VERDICTS.labels("video", out.result.verdict).inc()
        log.info("analysis_done", verdict=out.result.verdict, ms=out.result.processing_ms, explained=len(out.heatmaps))
    except Cancelled:
        FAILURES.labels("video", "cancelled").inc()
        jobs.mark_failed(job_id, "Cancelled.")
    except AnalysisError as exc:
        FAILURES.labels("video", "user_error").inc()
        jobs.mark_failed(job_id, exc.message)
    except SoftTimeLimitExceeded:
        FAILURES.labels("video", "timeout").inc()
        jobs.mark_failed(job_id, "The analysis took too long. Try a shorter video.")
    except RETRYABLE as exc:
        if not _final_attempt(self):
            finished = False
            raise self.retry(exc=exc, countdown=RETRY_COUNTDOWNS[self.request.retries]) from exc
        FAILURES.labels("video", "infrastructure").inc()
        log.exception("analysis_failed_infrastructure")
        _safe_fail(job_id)
    except Exception:
        FAILURES.labels("video", "internal").inc()
        log.exception("analysis_failed")
        _safe_fail(job_id)
    finally:
        if finished:
            _cleanup(upload_key, local)
        elif local and os.path.exists(local):
            os.remove(local)
        clear_context()


def _safe_fail(job_id: str) -> None:
    try:
        jobs.mark_failed(job_id, INTERNAL_ERROR_MESSAGE)
    except Exception:  # noqa: BLE001 – database down: the job expires on its own
        log.exception("mark_failed_failed")


# -------------------------------------------------------------- maintenance
@celery_app.task(name="mml.purge_expired")
def purge_expired() -> dict:
    """Hourly: expired analyses (+ heatmaps) and jobs; uploads older than 1 h."""
    removed = {
        "analyses": results.purge_expired(),
        "jobs": jobs.purge_expired(),
        "stale_uploads": get_storage().sweep_older_than("uploads/", 3600),
    }
    log.info("retention_sweep", **removed)
    return removed
