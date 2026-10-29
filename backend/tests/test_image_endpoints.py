"""Tests for image upload, validation, and prediction endpoints."""
from __future__ import annotations

import io


def test_image_upload_valid_jpeg(client, tiny_jpeg_bytes):
    resp = client.post(
        "/api/predict/image",
        files={"file": ("test.jpg", tiny_jpeg_bytes, "image/jpeg")},
    )
    data = resp.json()
    # With no model configured, expect 503 with UNAVAILABLE status
    assert resp.status_code in (200, 503)
    assert data["status"] in ("unavailable", "error")
    # Crucially: no fabricated prediction
    assert data.get("predicted_label") is None
    assert data.get("score") is None
    # Metadata should still be populated
    assert data.get("metadata") is not None
    assert data["metadata"]["width"] == 10
    assert data["metadata"]["height"] == 10


def test_image_upload_valid_png(client, tiny_png_bytes):
    resp = client.post(
        "/api/predict/image",
        files={"file": ("test.png", tiny_png_bytes, "image/png")},
    )
    data = resp.json()
    assert resp.status_code in (200, 503)
    assert data["status"] in ("unavailable", "error")
    assert data.get("predicted_label") is None


def test_image_upload_unsupported_format(client, text_file_bytes):
    resp = client.post(
        "/api/predict/image",
        files={"file": ("document.pdf", text_file_bytes, "application/pdf")},
    )
    assert resp.status_code == 415


def test_image_upload_corrupt_file(client, corrupt_bytes):
    resp = client.post(
        "/api/predict/image",
        files={"file": ("corrupt.jpg", corrupt_bytes, "image/jpeg")},
    )
    # Should fail with 422 (unprocessable) not 500
    assert resp.status_code in (422, 503)


def test_image_upload_oversized(client, monkeypatch):
    """Simulate an oversized upload."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "max_image_size_mb", 0)
    resp = client.post(
        "/api/predict/image",
        files={"file": ("big.jpg", b"12345", "image/jpeg")},
    )
    assert resp.status_code == 413


def test_image_no_fake_prediction_without_model(client, tiny_jpeg_bytes):
    """
    The most critical test: uploading an image must NEVER return a fabricated
    real/fake label or score when the model is not configured.
    """
    resp = client.post(
        "/api/predict/image",
        files={"file": ("test.jpg", tiny_jpeg_bytes, "image/jpeg")},
    )
    data = resp.json()
    assert data.get("predicted_label") is None, (
        "predicted_label must be None when model is not configured"
    )
    assert data.get("score") is None, (
        "score must be None when model is not configured"
    )
    assert data.get("real_score") is None
    assert data.get("fake_score") is None
    assert data["status"] != "success", (
        "status must not be 'success' without a configured model"
    )


def test_image_unavailable_has_model_id(client, tiny_jpeg_bytes):
    resp = client.post(
        "/api/predict/image",
        files={"file": ("test.jpg", tiny_jpeg_bytes, "image/jpeg")},
    )
    data = resp.json()
    assert "model_id" in data
    assert data["model_id"] == "hybrid_xception_vit"
