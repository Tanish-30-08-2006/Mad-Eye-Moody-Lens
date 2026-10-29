"""Tests for audio upload, validation, and prediction endpoints."""
from __future__ import annotations


def test_audio_upload_valid_wav(client, wav_bytes):
    resp = client.post(
        "/api/predict/audio",
        files={"file": ("test.wav", wav_bytes, "audio/wav")},
    )
    data = resp.json()
    assert resp.status_code in (200, 503)
    assert data["status"] in ("unavailable", "error")
    # No fabricated prediction
    assert data.get("predicted_label") is None
    assert data.get("score") is None
    # Metadata present
    assert data.get("metadata") is not None


def test_audio_upload_unsupported_format(client, text_file_bytes):
    resp = client.post(
        "/api/predict/audio",
        files={"file": ("file.exe", text_file_bytes, "application/octet-stream")},
    )
    assert resp.status_code == 415


def test_audio_upload_oversized(client, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "max_audio_size_mb", 0)  # limit = 0 bytes
    resp = client.post(
        "/api/predict/audio",
        files={"file": ("big.wav", b"12345", "audio/wav")},
    )
    assert resp.status_code == 413


def test_audio_no_fake_prediction_without_model(client, wav_bytes):
    """No fabricated audio prediction must appear when the model is absent."""
    resp = client.post(
        "/api/predict/audio",
        files={"file": ("test.wav", wav_bytes, "audio/wav")},
    )
    data = resp.json()
    assert data.get("predicted_label") is None
    assert data.get("score") is None
    assert data["status"] != "success"


def test_audio_unavailable_has_model_id(client, wav_bytes):
    resp = client.post(
        "/api/predict/audio",
        files={"file": ("test.wav", wav_bytes, "audio/wav")},
    )
    data = resp.json()
    assert "model_id" in data
    assert data["model_id"] == "ssl_antispoof_audio"


def test_audio_mp3_extension_accepted(client, wav_bytes):
    """MP3 extension should be accepted by the upload validator."""
    resp = client.post(
        "/api/predict/audio",
        files={"file": ("test.mp3", wav_bytes, "audio/mpeg")},
    )
    # May get 503 (model not configured) but not 415 (format rejection)
    assert resp.status_code != 415
