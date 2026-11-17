"""Video job state (design doc Section 6).

Durable state lives in PostgreSQL (``jobs``); fast-changing progress, stage and
the cancel flag live in a Redis hash ``job:<id>`` so polling every 1.5 s never
hits the database for writes. ``get_job`` overlays Redis on the row.

Status values are exactly the frontend's: queued | running | done | failed.
"""

from __future__ import annotations

import time
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete

from app.core.config import settings
from app.core.errors import NotFound
from app.core.redis import get_redis
from app.db.models import Job
from app.db.session import session_scope
from app.schemas import JobStatus
from app.services import results


def _key(job_id: str) -> str:
    return f"job:{job_id}"


def _uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(hex=value)
    except ValueError as exc:
        raise NotFound("Job") from exc


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def create_job() -> tuple[str, str]:
    """Insert a queued job; returns (job_id, pre-allocated analysis_id)."""
    job_id, analysis_id = uuid.uuid4(), uuid.uuid4()
    now = datetime.now(UTC)
    with session_scope() as s:
        s.add(
            Job(
                id=job_id,
                status="queued",
                progress=0.0,
                stage="queued",
                analysis_id=analysis_id,
                created_at=now,
                expires_at=now + timedelta(hours=settings.job_ttl_h),
            )
        )
    get_redis().hset(_key(job_id.hex), mapping={"status": "queued", "progress": 0, "stage": "queued"})
    get_redis().expire(_key(job_id.hex), settings.job_ttl_h * 3600)
    return job_id.hex, analysis_id.hex


def attach_task(job_id: str, task_id: str) -> None:
    with session_scope() as s:
        job = s.get(Job, _uuid(job_id))
        if job:
            job.celery_task_id = task_id


def mark_running(job_id: str) -> None:
    with session_scope() as s:
        job = s.get(Job, _uuid(job_id))
        if job and job.status == "queued":
            job.status, job.stage, job.started_at = "running", "frames", datetime.now(UTC)
    get_redis().hset(_key(job_id), mapping={"status": "running", "stage": "frames"})


class ProgressReporter:
    """Writes progress/stage to Redis, throttled to one write per 250 ms."""

    def __init__(self, job_id: str, min_interval_s: float = 0.25):
        self.job_id, self.min_interval_s, self._last = job_id, min_interval_s, 0.0

    def progress(self, value: float) -> None:
        now = time.monotonic()
        if value < 1.0 and now - self._last < self.min_interval_s:
            return
        self._last = now
        get_redis().hset(_key(self.job_id), "progress", round(min(max(value, 0.0), 1.0), 3))

    def stage(self, name: str) -> None:
        r = get_redis()
        r.hset(_key(self.job_id), "stage", name)
        if name != "frames":
            r.hset(_key(self.job_id), "progress", 1.0)  # frontend contract: audio/finalising at 1.0

    def cancelled(self) -> bool:
        return get_redis().hget(_key(self.job_id), "cancel") == "1"


def mark_done(job_id: str) -> None:
    with session_scope() as s:
        job = s.get(Job, _uuid(job_id))
        if job:
            job.status, job.progress, job.stage, job.error = "done", 1.0, None, None
            job.finished_at = datetime.now(UTC)
    get_redis().hset(_key(job_id), mapping={"status": "done", "progress": 1.0, "stage": ""})


def mark_failed(job_id: str, message: str) -> None:
    with session_scope() as s:
        job = s.get(Job, _uuid(job_id))
        if job and job.status != "done":
            job.status, job.error, job.stage = "failed", message, None
            job.progress = float(get_redis().hget(_key(job_id), "progress") or job.progress or 0.0)
            job.finished_at = datetime.now(UTC)
    get_redis().hset(_key(job_id), mapping={"status": "failed", "stage": ""})


def request_cancel(job_id: str) -> str | None:
    """Flag a job for cancellation; returns its Celery task id (to revoke if queued)."""
    with session_scope() as s:
        job = s.get(Job, _uuid(job_id))
        if job is None or _aware(job.expires_at) <= datetime.now(UTC):
            raise NotFound("Job")
        if job.status in ("done", "failed"):
            return None
        get_redis().hset(_key(job_id), "cancel", "1")
        if job.status == "queued":
            job.status, job.error, job.stage = "failed", "Cancelled.", None
            job.finished_at = datetime.now(UTC)
            get_redis().hset(_key(job_id), mapping={"status": "failed", "stage": ""})
        return job.celery_task_id


def get_job(job_id: str) -> JobStatus:
    """PostgreSQL row + live Redis progress; attaches the result when done."""
    with session_scope() as s:
        job = s.get(Job, _uuid(job_id))
        if job is None or _aware(job.expires_at) <= datetime.now(UTC):
            raise NotFound("Job")
        s.expunge(job)

    status, progress, stage = job.status, job.progress, job.stage
    live = get_redis().hgetall(_key(job_id))
    if status in ("queued", "running") and live:
        status = live.get("status", status)  # type: ignore[assignment]
        progress = float(live.get("progress", progress) or 0.0)
        stage = live.get("stage") or stage

    result = None
    if status == "done":
        try:
            result = results.get_result(job.analysis_id.hex)
        except NotFound:
            # Result already expired (retention shorter than job TTL is not allowed, but be safe).
            status, job.error = "failed", "The result has expired."
    return JobStatus(
        job_id=job_id,
        status=status,  # type: ignore[arg-type]
        progress=round(progress, 3),
        result=result,
        error=job.error if status == "failed" else None,
        stage=stage if status in ("queued", "running") else None,  # type: ignore[arg-type]
    )


def analysis_id_for(job_id: str) -> str:
    with session_scope() as s:
        job = s.get(Job, _uuid(job_id))
        if job is None:
            raise NotFound("Job")
        return job.analysis_id.hex


def purge_expired() -> int:
    now = datetime.now(UTC)
    with session_scope() as s:
        res = s.execute(delete(Job).where(Job.expires_at <= now))
        return res.rowcount or 0
