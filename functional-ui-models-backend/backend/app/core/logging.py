"""Structured JSON logging (design doc Section 10).

Every log line carries the ``request_id`` (and ``job_id`` / ``analysis_id``
when known) through ``contextvars``, so one request can be followed from the
API into the worker. Never log file names, bytes, frames, IPs or scores arrays.
"""

from __future__ import annotations

import contextvars
import logging
import sys
import uuid

import structlog

request_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("request_id", default=None)


def new_request_id() -> str:
    return uuid.uuid4().hex


def configure_logging(level: str = "INFO", json_logs: bool = True) -> None:
    """Configure structlog + stdlib logging once per process."""
    shared = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]
    renderer = structlog.processors.JSONRenderer() if json_logs else structlog.dev.ConsoleRenderer()
    structlog.configure(
        processors=[*shared, structlog.processors.format_exc_info, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level.upper())),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )
    # Route stdlib loggers (uvicorn, celery, sqlalchemy) to stdout at the same level.
    logging.basicConfig(stream=sys.stdout, level=level.upper(), format="%(message)s")


def get_logger(name: str = "mml") -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)


def bind_context(**values: object) -> None:
    """Attach ids (request_id, job_id, analysis_id, ...) to every later log line."""
    structlog.contextvars.bind_contextvars(**{k: v for k, v in values.items() if v is not None})


def clear_context() -> None:
    structlog.contextvars.clear_contextvars()


def size_bucket(n_bytes: int) -> str:
    """Coarse size label for logs/metrics: never log exact sizes of user media."""
    mb = n_bytes / (1024 * 1024)
    for edge in (1, 5, 10, 25, 50, 100):
        if mb <= edge:
            return f"<= {edge} MB"
    return "> 100 MB"
