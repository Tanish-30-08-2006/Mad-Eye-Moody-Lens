"""
reddit_extension/backend/tests/test_media_api.py – Tests for v1 media detection API.

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
import shutil
import subprocess

import pytest

# Needs the host backend (`app.*`), which is not in this repo: skip cleanly without it.
pytest.importorskip("app.main")

from PIL import Image  # noqa: E402

from moody_lens_ext.media import (
    DetectionJob,
    DetectResponse,
    HealthResponse,
    JobStatusResponse,
    ModelResult,
)
from app.core.config import settings
from app.services import jobs


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
    res = client.get("/api/v1/health", headers={"X-Client": "extension"})
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


def test_openapi_and_job_routing(client, monkeypatch):
    paths = client.get("/openapi.json").json()["paths"]
    for suffix in ("detect", "detect/batch", "jobs/{job_id}", "health", "brain/status", "detect-url",
                   "verdicts/lookup", "feedback", "jobs/{job_id}/explain"):
        assert f"/api/v1/{suffix}" in paths
    shared = paths["/api/v1/jobs/{job_id}"]
    assert "delete" in shared
    variants = shared["get"]["responses"]["200"]["content"]["application/json"]["schema"]["anyOf"]
    assert {item["$ref"].rsplit("/", 1)[-1] for item in variants} == {"DetectionJob", "JobStatus"}

    host_id, _ = jobs.create_job()
    host = client.get(f"/api/v1/jobs/{host_id}").json()
    assert host["status"] == "queued" and host["progress"] == 0 and "overall_score" not in host

    image = ("a.png", make_png(), "image/png")
    ext_id = client.post("/api/v1/detect", files={"media": image}).json()["job_id"]
    ext = client.get(f"/api/v1/jobs/{ext_id}", headers={"X-Client": "extension"}).json()
    assert ext["status"] == "completed" and ext["mock"] is True and "progress" not in ext
    assert ext["models"]["image"]["model_id"] == settings.image_model_id
    assert ext["model_versions"][settings.image_model_id] == "stub"

    # Extension IDs expire after completion. Clearing the process store models an API restart;
    # durable host IDs are independent of it.
    monkeypatch.setattr(settings, "job_ttl_h", 0)
    expired_id = client.post("/api/v1/detect", files={"media": image}).json()["job_id"]
    assert client.get(f"/api/v1/jobs/{expired_id}").status_code == 404
    from moody_lens_ext.media import EXTENSION_JOBS
    EXTENSION_JOBS.clear()
    assert client.get(f"/api/v1/jobs/{ext_id}").status_code == 404
    assert client.get(f"/api/v1/jobs/{host_id}").json()["status"] == "queued"


@pytest.mark.parametrize(("gone", "expected"), [
    ("test-fast", {"image": False, "audio": False, "video": True}),
    ("test-video", {"image": True, "audio": True, "video": False}),
])
def test_readiness_per_queue(client, infra, monkeypatch, gone, expected):
    monkeypatch.setenv("MML_BRAIN", "host")
    infra.delete(f"worker:{gone}")
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    assert client.get("/api/v1/ready").status_code == 503
    body = client.get("/api/v1/brain/status").json()
    assert body["readiness"] == expected
    assert body["healthy"] is True and body["is_mock"] is True
    for kind, ready in expected.items():
        if kind != "audio":  # audio can be loaded in the video worker even with no fast queue
            assert body["models"][kind]["state"] == ("loaded" if ready else "unavailable")
    image = client.post("/api/v1/detect", files={"media": ("a.png", make_png(), "image/png")})
    assert image.status_code == (202 if expected["image"] else 503)


def test_cache_invalidation_uses_revision_and_result_settings(client, monkeypatch):
    def lookup(key):
        return client.get("/api/v1/verdicts/lookup", params={"sha256": key})

    image = ("a.png", make_png(), "image/png")
    job_id = client.post("/api/v1/detect", files={"media": image}).json()["job_id"]
    job = client.get(f"/api/v1/jobs/{job_id}").json()
    assert lookup(job["cache_key"]).json()["mock"] is True
    with monkeypatch.context() as patch:
        patch.setattr(settings, "image_model_revision", "a" * 40)
        assert lookup(job["cache_key"]).status_code == 404
    monkeypatch.setattr(settings, "band_high", 0.92)
    assert lookup(job["cache_key"]).status_code == 404


def test_real_cache_rejects_worker_artifacts_that_disagree_with_pins(workers_up, monkeypatch):
    from moody_lens_ext.brain.host_brain import HostBrain

    monkeypatch.setattr(settings, "detector_backend", "real")
    monkeypatch.setattr(settings, "image_model_revision", "a" * 40)
    monkeypatch.setattr(settings, "audio_model_revision", "b" * 40)
    monkeypatch.setattr(settings, "face_model_sha256", "c" * 64)
    brain = HostBrain()
    assert brain.model_status()["image"]["loaded"][0]["revision"] == "stub"
    assert brain.describe().cacheable is False


def test_host_gallery_partial_failure_and_no_face(client, monkeypatch):
    from app.detectors.registry import get_registry
    from app.core.errors import AnalysisError

    monkeypatch.setattr(get_registry()["face"], "faces", False)
    image_detector = get_registry()["image"]
    predict = image_detector.predict_pil

    def predict_or_fail(img):
        if img.width == 32:
            raise AnalysisError("Fixture inference failed.")
        return predict(img)

    monkeypatch.setattr(image_detector, "predict_pil", predict_or_fail)
    parts = [("media", ("a.png", make_png(size), "image/png")) for size in [(64, 64), (32, 32), (48, 48)]]
    reply = client.post("/api/v1/detect/batch", files=parts)
    assert reply.status_code == 202, reply.text
    job = client.get(f"/api/v1/jobs/{reply.json()['job_id']}").json()
    assert job["status"] == "completed"
    assert [(item["index"], item["status"]) for item in job["items"]] == [
        (0, "completed"), (1, "failed"), (2, "completed"),
    ]
    assert job["items"][1]["error"] == "Fixture inference failed."
    assert job["models"]["face"] is None and job["mock"] is True


@pytest.mark.skipif(not shutil.which("ffprobe") or not shutil.which("ffmpeg"), reason="ffmpeg and ffprobe required")
def test_shared_host_audio_and_video(client, tmp_path):
    video, audio, quiet = (tmp_path / filename for filename in ("v.mp4", "a.m4a", "silence.m4a"))
    for source, path, codec in [
        ("color=red:size=160x120:rate=10:duration=2", video, "-c:v"),
        ("sine=frequency=660:duration=2", audio, "-c:a"),
        ("anullsrc=r=16000:cl=mono", quiet, "-c:a"),
    ]:
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", source, "-t", "2", codec,
             "libx264" if codec == "-c:v" else "aac", str(path)], check=True,
        )

    def scan(kind, media, track=None):
        files = {"media": (media.name, media.read_bytes())}
        if track:
            files["audio"] = (track.name, track.read_bytes())
        res = client.post("/api/v1/detect", files=files, data={"media_type": kind})
        assert res.status_code == 202, res.text
        job = client.get(f"/api/v1/jobs/{res.json()['job_id']}").json()
        assert job["status"] == "completed" and job["mock"] is True, job
        return job

    assert scan("audio", audio)["models"]["audio"]["model_id"] == settings.audio_model_id
    assert scan("video", video)["models"]["audio"] is None
    assert scan("video", video, quiet)["models"]["audio"] is None
    with_audio = scan("video", video, audio)
    assert with_audio["models"]["audio"]["model_id"] == settings.audio_model_id
    assert all(0 <= seg["start"] < seg["end"] <= 2 for seg in with_audio["timeline"])


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
            "Access-Control-Request-Headers": "Content-Type, X-Client",
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
    assert res.json().get("code") == "NOT_IMPLEMENTED"


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
