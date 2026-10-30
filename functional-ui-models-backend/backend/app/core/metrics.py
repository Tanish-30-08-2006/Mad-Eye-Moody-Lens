"""Prometheus metrics (design doc Section 10).

The API exposes them on ``/api/v1/metrics`` (blocked at nginx). Workers run in
separate processes; they expose their own registry on ``MML_WORKER_METRICS_PORT``
when set, so the API never needs to aggregate across processes.
"""

from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram

HTTP_REQUESTS = Counter("mml_http_requests_total", "HTTP requests", ["route", "status"])
HTTP_SECONDS = Histogram("mml_http_request_seconds", "HTTP latency", ["route"])

ANALYSIS_SECONDS = Histogram(
    "mml_analysis_seconds",
    "Time spent per analysis stage",
    ["media_type", "stage"],
    buckets=(0.1, 0.25, 0.5, 1, 2, 4, 8, 15, 30, 60, 120, 300),
)
MODEL_SECONDS = Histogram(
    "mml_model_inference_seconds",
    "Per-call model inference time",
    ["model"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8),
)
VERDICTS = Counter("mml_verdicts_total", "Verdicts returned", ["media_type", "verdict"])
FAILURES = Counter("mml_analysis_failures_total", "Failed analyses", ["media_type", "reason"])
QUEUE_DEPTH = Gauge("mml_queue_depth", "Tasks waiting per queue", ["queue"])
WORKERS_READY = Gauge("mml_workers_ready", "Workers with models loaded per queue", ["queue"])
RATE_LIMITED = Counter("mml_rate_limited_total", "Requests rejected by rate limiting", ["bucket"])
