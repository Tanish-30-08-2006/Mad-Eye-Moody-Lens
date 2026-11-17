"""Celery application (design doc Section 6).

Queues
    inference.fast   image + audio, waited on synchronously by the API (≤ 30 s)
    inference.video  video jobs, polled by the browser
    maintenance      hourly retention sweep (consumed by the video worker)

Reliability settings
    acks_late + reject_on_worker_lost   a crashed worker's task goes back on the queue
    prefetch_multiplier = 1             a busy worker never hoards tasks
    visibility_timeout > hard time limit so Redis does not redeliver running tasks

Each worker container runs ``--concurrency=1`` (one task per process): models are
loaded once in that process and never shared across threads.
"""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab
from celery.signals import worker_process_init

from app.core.config import settings
from app.core.logging import configure_logging, get_logger

celery_app = Celery(
    "mml", broker=settings.effective_broker_url, backend=settings.redis_url, include=["app.worker.tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
    task_track_started=True,
    result_expires=3600,
    broker_connection_retry_on_startup=True,
    broker_transport_options={"visibility_timeout": settings.video_time_limit_s * 4},
    task_routes={
        "mml.analyze_fast": {"queue": "inference.fast"},
        "mml.analyze_video": {"queue": "inference.video"},
        "mml.purge_expired": {"queue": "maintenance"},
    },
    beat_schedule={
        "purge-expired-hourly": {"task": "mml.purge_expired", "schedule": crontab(minute=7)},
    },
    timezone="UTC",
)

log = get_logger(__name__)


@worker_process_init.connect
def _init_worker_process(**_kwargs) -> None:  # type: ignore[no-untyped-def]
    """Runs once in each worker child: logging, torch threads, model load, heartbeat."""
    configure_logging(settings.log_level, json_logs=settings.is_production)

    from app.detectors.registry import get_registry, load_for_queues  # noqa: PLC0415
    from app.services import heartbeat  # noqa: PLC0415

    queues = [q.strip() for q in settings.worker_queues.split(",") if q.strip()]
    wid = heartbeat.worker_id()

    if settings.detector_backend == "real":
        import torch  # noqa: PLC0415

        # Keep (API + workers x threads) <= physical cores on the laptop.
        torch.set_num_threads(settings.torch_threads)

    if settings.worker_metrics_port:
        from prometheus_client import start_http_server  # noqa: PLC0415

        start_http_server(settings.worker_metrics_port)

    reg = get_registry()  # build once, before any other thread can race for it

    def snapshot() -> dict:
        return {k: {"name": d.name, "revision": d.revision, "loaded": d.loaded} for k, d in reg.items()}

    # Publish "not loaded" immediately so /models shows the worker warming up.
    heartbeat.start_heartbeat_thread(wid, queues, snapshot)
    try:
        loaded = load_for_queues([q for q in queues if q.startswith("inference.")])
        log.info("models_loaded", worker=wid, queues=queues, models=loaded)
    except Exception:
        # Label self-check or weight checksum failed: stay up but report loaded=false,
        # so /ready keeps traffic away and the logs say why.
        log.exception("model_load_failed", worker=wid)
