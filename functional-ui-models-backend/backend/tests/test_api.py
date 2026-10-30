"""API contract tests with stub detectors (design doc Sections 4 and 12).

Stub scores: image 0.9, face 0.8, audio 0.2; the video stub draws a sine wave
over 24 frames. These cover every status code the frontend handles.
"""

from __future__ import annotations

import base64
import io
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from PIL import Image

from app.core.config import settings
from app.db.models import Analysis
from app.db.session import session_scope
from app.detectors.registry import get_registry
from tests.conftest import png_bytes, wav_bytes


def _files(name: str, data: bytes, mime: str) -> dict:
    return {"file": (name, data, mime)}


def _uploads_left(store_root) -> list:
    d = store_root / "uploads"
    return [p for p in d.rglob("*") if p.is_file()] if d.exists() else []


# ----------------------------------------------------------------- ops
def test_health_and_headers(client):
    r = client.get("/api/v1/health", headers={"X-Request-ID": "abc123"})
    assert r.json() == {"status": "ok"}
    assert r.headers["X-Request-ID"] == "abc123"
    assert r.headers["X-Content-Type-Options"] == "nosniff"


def test_models_contract(client):
    body = client.get("/api/v1/models").json()
    assert [m["key"] for m in body] == ["image", "face", "audio", "video"]
    assert body[0]["name"] == "Organika/sdxl-detector"
    assert body[1]["name"] == "Xicor9/efficientnet-b0-ffpp-c23"
    assert body[2]["name"] == "MelodyMachine/Deepfake-audio-detection-V2"
    assert all(m["loaded"] for m in body)


def test_ready(client):
    r = client.get("/api/v1/ready")
    assert r.status_code == 200 and r.json()["status"] == "ready"


def test_not_ready_without_workers(infra):
    from fastapi.testclient import TestClient

    from app.main import app

    c = TestClient(app)
    assert c.get("/api/v1/ready").status_code == 503
    assert c.get("/api/v1/models").json()[0]["loaded"] is False
    r = c.post("/api/v1/analyze/image", files=_files("a.png", png_bytes(), "image/png"))
    assert r.status_code == 503 and "loading" in r.json()["error"]


# --------------------------------------------------------------- image
def test_image_result_and_explanation(client, store_root):
    r = client.post("/api/v1/analyze/image", files=_files("a.png", png_bytes(), "image/png"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["verdict"] == "likely_fake" and body["fake_probability"] == 0.9
    assert [s["task"] for s in body["scores"]] == ["ai_generated_image", "face_manipulation"]
    assert body["details"] == {"faces_found": 1}
    assert body["explanation_available"] is True
    assert body["disclaimer"] and body["api_version"] == "1.1"
    assert set(body["model_versions"]) == {"Organika/sdxl-detector", "Xicor9/efficientnet-b0-ffpp-c23"}
    assert _uploads_left(store_root) == []  # privacy: upload deleted after the task

    # Stored result is re-fetchable
    again = client.get(f"/api/v1/analyses/{body['analysis_id']}").json()
    assert again["verdict"] == "likely_fake" and again["explanation_available"] is True

    # Grad-CAM: attention + box only, never image pixels
    ex = client.get(f"/api/v1/analyses/{body['analysis_id']}/explanation").json()
    assert ex["method"] == "grad-cam" and ex["model"] == "Xicor9/efficientnet-b0-ffpp-c23"
    item = ex["items"][0]
    assert item["source"] == "image" and item["time_s"] is None and item["box"] == [24, 24, 72, 72]
    im = Image.open(io.BytesIO(base64.b64decode(item["heatmap_png"])))
    assert im.mode == "L" and im.size == (224, 224)


def test_image_without_face_has_no_explanation(client, monkeypatch):
    monkeypatch.setattr(get_registry()["face"], "faces", False)
    body = client.post("/api/v1/analyze/image", files=_files("a.png", png_bytes(), "image/png")).json()
    assert body["details"]["faces_found"] == 0 and len(body["scores"]) == 1
    assert body["explanation_available"] is False
    r = client.get(f"/api/v1/analyses/{body['analysis_id']}/explanation")
    assert r.status_code == 404
    assert r.json() == {"error": "No explanation is available for this analysis."}


def test_rejects_wrong_type(client):
    r = client.post("/api/v1/analyze/image", files=_files("a.png", b"MZ\x90\x00 not an image", "image/png"))
    assert r.status_code == 415 and r.json() == {"error": "Unsupported image format."}


def test_rejects_too_large(client, monkeypatch):
    monkeypatch.setattr(settings, "max_image_mb", 0)
    r = client.post("/api/v1/analyze/image", files=_files("a.png", png_bytes(), "image/png"))
    assert r.status_code == 413 and r.json()["error"] == "File is larger than 0 MB."


def test_rejects_empty(client):
    r = client.post("/api/v1/analyze/image", files=_files("a.png", b"", "image/png"))
    assert r.status_code == 422


def test_rejects_pixel_bomb(client, monkeypatch):
    monkeypatch.setattr(settings, "max_image_pixels", 1000)
    r = client.post("/api/v1/analyze/image", files=_files("a.png", png_bytes(), "image/png"))
    assert r.status_code == 422


# --------------------------------------------------------------- audio
def test_audio_windows(client, store_root):
    r = client.post("/api/v1/analyze/audio", files=_files("a.wav", wav_bytes(9.0), "audio/wav"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["verdict"] == "likely_real"
    assert body["scores"][0]["task"] == "synthetic_speech"
    assert len(body["segments"]) == 3 and body["details"]["duration_s"] == 9.0
    assert body["explanation_available"] is False
    assert _uploads_left(store_root) == []


def test_audio_rejects_image_bytes(client):
    r = client.post("/api/v1/analyze/audio", files=_files("a.wav", png_bytes(), "audio/wav"))
    assert r.status_code == 415


# --------------------------------------------------------------- video
def test_video_job_lifecycle(client, mp4_bytes, store_root):
    r = client.post("/api/v1/analyze/video", files=_files("v.mp4", mp4_bytes, "video/mp4"))
    assert r.status_code == 202, r.text
    job = r.json()
    assert job["status"] in ("queued", "running", "done")

    # Eager Celery: the job already ran; polling returns the final state.
    done = client.get(f"/api/v1/jobs/{job['job_id']}").json()
    assert done["status"] == "done" and done["progress"] == 1.0 and done["error"] is None
    res = done["result"]
    assert res["media_type"] == "video"
    assert len(res["segments"]) == settings.video_frames
    d = res["details"]
    assert d["frames_sampled"] == 24 and d["frames_with_face"] == 24 and d["audio_checked"] is True
    assert {s["task"] for s in res["scores"]} == {"face_manipulation", "synthetic_speech"}
    assert res["explanation_available"] is True
    assert _uploads_left(store_root) == []

    ex = client.get(f"/api/v1/analyses/{res['analysis_id']}/explanation").json()
    assert len(ex["items"]) == settings.explain_max_frames
    assert all(i["source"] == "frame" and i["time_s"] is not None for i in ex["items"])
    times = [i["time_s"] for i in ex["items"]]
    assert times == sorted(times)


def test_video_without_faces_fails_cleanly(client, mp4_bytes, monkeypatch):
    monkeypatch.setattr(get_registry()["face"], "faces", False)
    job = client.post("/api/v1/analyze/video", files=_files("v.mp4", mp4_bytes, "video/mp4")).json()
    done = client.get(f"/api/v1/jobs/{job['job_id']}").json()
    assert done["status"] == "failed"
    assert done["error"] == "No face was detected, so the face-manipulation check could not run."


def test_unknown_job_and_analysis(client):
    assert client.get(f"/api/v1/jobs/{uuid.uuid4().hex}").json() == {"error": "Job not found."}
    assert client.get("/api/v1/jobs/not-a-uuid").status_code == 404
    assert client.get(f"/api/v1/analyses/{uuid.uuid4().hex}").status_code == 404


def test_cancel_queued_job(client):
    from app.services import jobs

    job_id, _ = jobs.create_job()
    assert client.delete(f"/api/v1/jobs/{job_id}").status_code == 204
    body = client.get(f"/api/v1/jobs/{job_id}").json()
    assert body["status"] == "failed" and body["error"] == "Cancelled."


# ------------------------------------------------------- limits & retention
def test_rate_limit(client, monkeypatch):
    monkeypatch.setattr(settings, "rl_fast_per_min", 2)
    for _ in range(2):
        assert client.post("/api/v1/analyze/image", files=_files("a.png", png_bytes(), "image/png")).status_code == 200
    r = client.post("/api/v1/analyze/image", files=_files("a.png", png_bytes(), "image/png"))
    assert r.status_code == 429 and int(r.headers["Retry-After"]) >= 1
    assert r.json()["error"].startswith("Too many requests.")


def test_queue_full(client, infra, monkeypatch):
    monkeypatch.setattr(settings, "max_queue_depth", 1)
    infra.rpush("inference.fast", "pending-task")
    r = client.post("/api/v1/analyze/image", files=_files("a.png", png_bytes(), "image/png"))
    assert r.status_code == 503 and r.headers["Retry-After"] == "60"


def test_retention_sweep(client, store_root):
    from app.worker.tasks import purge_expired

    body = client.post("/api/v1/analyze/image", files=_files("a.png", png_bytes(), "image/png")).json()
    aid = body["analysis_id"]
    assert (store_root / "explanations" / aid / "meta.json").exists()
    with session_scope() as s:
        s.get(Analysis, uuid.UUID(hex=aid)).expires_at = datetime.now(UTC) - timedelta(seconds=1)

    assert client.get(f"/api/v1/analyses/{aid}").status_code == 404  # expired = gone to clients
    removed = purge_expired()
    assert removed["analyses"] == 1
    assert not (store_root / "explanations" / aid).exists()


def test_retention_default_is_seven_days():
    assert settings.result_retention_days == 7


@pytest.mark.parametrize("path", ["/docs", "/openapi.json"])
def test_docs_available_outside_production(client, path):
    assert client.get(path).status_code == 200
