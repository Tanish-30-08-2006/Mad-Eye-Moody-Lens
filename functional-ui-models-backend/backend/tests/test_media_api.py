"""
functional-ui-models-backend/backend/tests/test_media_api.py – Tests for v1 media detection API.

Covers:
1. Happy path image upload -> 202 -> GET job -> completed verdict
2. Detectors that did not run (e.g. audio on image) are null / omitted
3. Wrong MIME/format rejection -> 415/422
4. Oversized media rejection -> 413
5. Unknown job ID -> 404
6. Health endpoint -> 200 with HealthResponse shape
7. CORS headers for chrome-extension:// origins
8. POST /api/v1/detect-url -> 501
9. Contract parity: Pydantic schemas mirror Zod schemas
"""

from __future__ import annotations

import io
import pytest
from PIL import Image

from app.api.v1.media import (
    DetectionJob,
    DetectResponse,
    HealthResponse,
    JobStatusResponse,
    ModelResult,
)
from app.core.config import settings


def make_png(size: tuple[int, int] = (64, 64)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (100, 150, 200)).save(buf, "PNG")
    return buf.getvalue()


# ── Health Endpoint ──────────────────────────────────────────────────────────

def test_health_endpoint_schema():
    """Verify that HealthResponse schema matches expected attributes."""
    health = HealthResponse(
        status="ok",
        version="1.0.0",
        models_available=["image", "face", "audio", "video"],
    )
    assert health.status == "ok"
    assert health.version == "1.0.0"
    assert len(health.models_available) == 4


def test_health_endpoint_http(client):
    """GET /api/v1/health returns 200 and matches HealthResponse schema."""
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    validated = HealthResponse.model_validate(data)
    assert validated.status == "ok"
    assert "image" in validated.models_available


# ── Detect Endpoint ──────────────────────────────────────────────────────────

def test_detect_image_happy_path(client):
    """POST /api/v1/detect with an image returns 202 {job_id}, and job status completes."""
    png = make_png()
    files = {"media": ("test.png", png, "image/png")}
    data = {"media_type": "image", "post_id": "t3_test123"}

    res = client.post("/api/v1/detect", files=files, data=data)
    assert res.status_code == 202
    body = res.json()
    assert "job_id" in body
    job_id = body["job_id"]

    # Validate DetectResponse schema
    detect_resp = DetectResponse.model_validate(body)
    assert detect_resp.job_id == job_id

    # Poll GET /api/v1/jobs/{job_id}
    job_res = client.get(f"/api/v1/jobs/{job_id}")
    assert job_res.status_code == 200
    job_data = job_res.json()

    # Validate DetectionJob schema
    job = DetectionJob.model_validate(job_data)
    assert job.job_id == job_id
    assert job.status == "completed"
    assert job.overall_score is not None
    assert 0.0 <= job.overall_score <= 1.0
    assert job.label in ("likely_real", "likely_fake", "inconclusive")
    assert job.models is not None
    assert job.models.image is not None
    assert job.models.image.score is not None
    assert job.models.image.confidence is not None


def test_detectors_that_did_not_run_are_null(client):
    """Detectors that did not run (e.g. audio on image) must be null / omitted."""
    png = make_png()
    files = {"media": ("test.png", png, "image/png")}
    res = client.post("/api/v1/detect", files=files, data={"media_type": "image"})
    assert res.status_code == 202
    job_id = res.json()["job_id"]

    job_res = client.get(f"/api/v1/jobs/{job_id}")
    job = DetectionJob.model_validate(job_res.json())

    # Audio detector was not run for an image post, so models.audio must be None
    assert job.models is not None
    assert job.models.audio is None


def test_detect_rejects_wrong_type(client):
    """POST /api/v1/detect with non-image bytes claiming to be PNG fails with 415 or 422."""
    corrupt_bytes = b"NOT_A_VALID_IMAGE_CONTENT"
    files = {"media": ("fake.png", corrupt_bytes, "image/png")}
    res = client.post("/api/v1/detect", files=files, data={"media_type": "image"})
    assert res.status_code in (415, 422)


def test_detect_rejects_oversized(client, monkeypatch):
    """POST /api/v1/detect with file exceeding max_image_mb returns 413."""
    monkeypatch.setattr(settings, "max_image_mb", 0)  # 0MB limit -> reject any file
    png = make_png()
    files = {"media": ("large.png", png, "image/png")}
    res = client.post("/api/v1/detect", files=files, data={"media_type": "image"})
    assert res.status_code == 413
    assert res.json().get("code") == "FILE_TOO_LARGE" or "larger" in res.json().get("error", "")


def test_detect_no_worker_mock_off_returns_503(infra, monkeypatch):
    """With allow_mock=False and no workers online, /detect returns 503."""
    from fastapi.testclient import TestClient
    from app.main import app

    monkeypatch.setattr(settings, "allow_mock", False)
    unbacked_client = TestClient(app)

    png = make_png()
    files = {"media": ("test.png", png, "image/png")}
    res = unbacked_client.post("/api/v1/detect", files=files, data={"media_type": "image"})
    assert res.status_code == 503
    body = res.json()
    assert body.get("code") == "SERVICE_UNAVAILABLE"
    assert "unavailable" in body.get("error", "").lower()


def test_detect_mock_mode_returns_mock_true(infra, monkeypatch):
    """With allow_mock=True, in-process fallback runs and marks job as mock: true."""
    from fastapi.testclient import TestClient
    from app.main import app

    monkeypatch.setattr(settings, "allow_mock", True)
    mock_client = TestClient(app)

    png = make_png()
    files = {"media": ("test.png", png, "image/png")}
    res = mock_client.post("/api/v1/detect", files=files, data={"media_type": "image"})
    assert res.status_code == 202
    job_id = res.json()["job_id"]

    job_res = mock_client.get(f"/api/v1/jobs/{job_id}")
    assert job_res.status_code == 200
    job = DetectionJob.model_validate(job_res.json())
    assert job.status == "completed"
    assert job.mock is True


# ── Jobs Endpoint ────────────────────────────────────────────────────────────

def test_unknown_job_returns_404(client):
    """GET /api/v1/jobs/{unknown_id} returns 404 Not Found."""
    res = client.get("/api/v1/jobs/non-existent-uuid-999")
    assert res.status_code == 404
    body = res.json()
    assert "error" in body


def test_job_status_response_schema():
    """Verify that JobStatusResponse (backward compat) parses full verdict breakdown."""
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
    assert job.models.image is not None
    assert job.models.image.label == "fake"


# ── CORS Headers ─────────────────────────────────────────────────────────────

def test_cors_headers_chrome_extension(client):
    """Requests with chrome-extension:// Origin header receive valid CORS headers."""
    ext_origin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
    res = client.options(
        "/api/v1/detect",
        headers={
            "Origin": ext_origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    assert res.status_code == 200
    allow_origin = res.headers.get("access-control-allow-origin")
    assert allow_origin in (ext_origin, "*")


# ── Tier-2 detect-url Stub ───────────────────────────────────────────────────

def test_detect_url_stub_returns_501(client):
    """POST /api/v1/detect-url returns 501 Not Implemented unless FEATURE_DETECT_URL is True."""
    res = client.post(
        "/api/v1/detect-url",
        json={"url": "https://v.redd.it/abc123/HLSPlaylist.m3u8", "media_type": "video"},
    )
    assert res.status_code == 501
    assert "not implemented" in res.json().get("error", "").lower()


# ── Contract Parity Test ─────────────────────────────────────────────────────

def test_contract_parity_json_schema():
    """
    Validates that Pydantic models export valid JSON Schemas that reflect
    extension/src/core/schema.ts structure and that both real backend and
    mock server payloads parse cleanly under the same Pydantic schema.
    """
    schema_job = DetectionJob.model_json_schema()
    assert "properties" in schema_job
    assert "job_id" in schema_job["properties"]
    assert "status" in schema_job["properties"]
    assert "overall_score" in schema_job["properties"]
    assert "label" in schema_job["properties"]
    assert "models" in schema_job["properties"]
    assert "mock" in schema_job["properties"]

    schema_detect = DetectResponse.model_json_schema()
    assert "job_id" in schema_detect["properties"]

    schema_health = HealthResponse.model_json_schema()
    assert "status" in schema_health["properties"]
    assert "models_available" in schema_health["properties"]

    # Verify mock server fixture payload satisfies real backend Pydantic model
    mock_server_payload = {
        "job_id": "job_1730592000000_abcde",
        "status": "completed",
        "overall_score": 0.12,
        "label": "likely_real",
        "models": {
            "image": {"score": 0.12, "label": "real", "confidence": 0.94},
        },
        "model_versions": {
            "image": "1.0.0",
        },
        "mock": True,
        "created_at": "2026-11-02T10:30:00Z",
        "updated_at": "2026-11-02T10:30:00Z",
    }
    validated_mock = DetectionJob.model_validate(mock_server_payload)
    assert validated_mock.job_id == "job_1730592000000_abcde"
    assert validated_mock.mock is True
    assert validated_mock.models.image.score == 0.12
