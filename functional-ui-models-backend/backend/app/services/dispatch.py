"""API-side dispatch: capacity checks, enqueue, and the synchronous wait.

The API never runs a model. For image/audio it stores the upload, enqueues
``mml.analyze_fast`` and waits (in the thread pool) for up to
``MML_SYNC_TIMEOUT_S``; for video it creates a job and returns 202 at once.
"""

from __future__ import annotations

import uuid

from celery.exceptions import TimeoutError as CeleryTimeout

from app.core.config import settings
from app.core.errors import AnalysisError, AnalysisTimeout, NotReady, QueueFull
from app.core.logging import get_logger, request_id_var
from app.core.metrics import QUEUE_DEPTH, WORKERS_READY
from app.core.redis import get_redis
from app.core.storage import get_storage, new_upload_key
from app.core.uploads import SavedUpload
from app.schemas import AnalysisResult, JobStatus
from app.services import heartbeat, jobs

log = get_logger(__name__)

FAST, VIDEO = "inference.fast", "inference.video"


def queue_depth(queue: str) -> int:
    """Pending tasks in a Celery queue (Redis broker keeps each queue as a list)."""
    try:
        depth = int(get_redis().llen(queue))
    except Exception:  # noqa: BLE001
        depth = 0
    QUEUE_DEPTH.labels(queue).set(depth)
    return depth


def ensure_capacity(queue: str) -> None:
    """503 before we accept work nobody can do (no worker) or too much of it."""
    ready = heartbeat.ready_queues()
    for q, n in ready.items():
        WORKERS_READY.labels(q).set(n)
    if ready.get(queue, 0) == 0:
        raise NotReady()
    if queue_depth(queue) >= settings.max_queue_depth:
        raise QueueFull()


def run_fast(saved: SavedUpload) -> AnalysisResult:
    """Store, enqueue and wait for an image/audio analysis."""
    from app.worker.tasks import analyze_fast  # noqa: PLC0415 – avoid importing Celery at module load

    key, analysis_id = new_upload_key(), uuid.uuid4().hex
    get_storage().put_file(key, saved.path)
    async_result = analyze_fast.apply_async(args=[saved.kind, key, analysis_id, request_id_var.get()], queue=FAST)
    try:
        payload = async_result.get(timeout=settings.sync_timeout_s, propagate=True, disable_sync_subtasks=False)
    except CeleryTimeout as exc:
        async_result.revoke()
        get_storage().delete(key)  # the task may never run; do not wait for the sweep
        raise AnalysisTimeout() from exc
    async_result.forget()  # the result is now in PostgreSQL; free the Redis result key

    if not payload.get("ok"):
        raise AnalysisError(payload.get("error", "Analysis failed."), int(payload.get("status", 500)))
    return AnalysisResult.model_validate(payload["result"])


def start_video(saved: SavedUpload) -> JobStatus:
    """Create a job, store the upload, enqueue; the browser polls /jobs/{id}."""
    from app.worker.tasks import analyze_video  # noqa: PLC0415

    key = new_upload_key()
    get_storage().put_file(key, saved.path)
    job_id, analysis_id = jobs.create_job()
    task_id = f"video-{job_id}"
    jobs.attach_task(job_id, task_id)
    analyze_video.apply_async(args=[job_id, key, analysis_id, request_id_var.get()], queue=VIDEO, task_id=task_id)
    return jobs.get_job(job_id)


def cancel_video(job_id: str) -> None:
    from app.worker.celery_app import celery_app  # noqa: PLC0415

    task_id = jobs.request_cancel(job_id)
    if task_id:
        # Queued: never starts. Running: the task sees the cancel flag between frames.
        celery_app.control.revoke(task_id)
