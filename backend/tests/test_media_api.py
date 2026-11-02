"""
backend/tests/test_media_api.py – Unit test stubs for v1 media detection API.

Verifies schema adherence and expected status codes for /detect, /jobs/{id},
and /health endpoints.

TODO: Wire into pytest execution harness in Phase 2.
"""

from __future__ import annotations

import pytest


def test_health_endpoint_schema():
    """
    Verify that HealthCheckResponse schema contains expected attributes.
    """
    from app.api.v1.media import HealthCheckResponse

    health = HealthCheckResponse(
        status="ok",
        version="1.0.0",
        models_available=["hybrid_xception_vit", "ssl_antispoof"],
    )

    assert health.status == "ok"
    assert health.version == "1.0.0"
    assert len(health.models_available) == 2


def test_detect_response_schema():
    """
    Verify that DetectResponse schema requires valid job_id string.
    """
    from app.api.v1.media import DetectResponse

    res = DetectResponse(job_id="test_job_123")
    assert res.job_id == "test_job_123"


def test_job_status_response_schema():
    """
    Verify that JobStatusResponse correctly parses full verdict breakdown.
    """
    from app.api.v1.media import JobStatusResponse, ModelResult

    job = JobStatusResponse(
        job_id="test_job_456",
        status="completed",
        overall_score=0.85,
        label="likely_fake",
        models={
            "image": ModelResult(score=0.85, label="fake", confidence=0.92)
        },
        model_versions={"image": "1.0.0"},
        created_at="2026-11-02T12:00:00Z",
        updated_at="2026-11-02T12:01:00Z",
    )

    assert job.status == "completed"
    assert job.overall_score == 0.85
    assert job.models is not None
    assert job.models["image"].label == "fake"
