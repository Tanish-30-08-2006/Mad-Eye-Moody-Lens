"""Tests for video upload, metadata, and prediction endpoints."""
from __future__ import annotations

import struct
import io


def _minimal_mp4_bytes() -> bytes:
    """
    Returns a minimal (invalid but recognisable) MP4-like byte sequence.
    Sufficient to pass the upload-format validator; not a playable video.
    In the CI environment without a real video, moviepy metadata extraction
    will fail gracefully, which is the tested behaviour.
    """
    # ftyp box that declares the mp4 brand
    ftyp = struct.pack(">I4s4sI4s", 24, b"ftyp", b"isom", 0x200, b"isom")
    mdat = struct.pack(">I4s", 8, b"mdat")
    return ftyp + mdat


def test_video_upload_format_accepted(client):
    mp4_bytes = _minimal_mp4_bytes()
    resp = client.post(
        "/api/predict/video",
        files={"file": ("test.mp4", mp4_bytes, "video/mp4")},
        data={"max_frames": "4"},
    )
    # Should not reject the format
    assert resp.status_code != 415
    # Metadata may or may not decode (likely fails gracefully)
    data = resp.json()
    assert "status" in data


def test_video_upload_unsupported_format(client, text_file_bytes):
    resp = client.post(
        "/api/predict/video",
        files={"file": ("file.txt", text_file_bytes, "text/plain")},
        data={"max_frames": "4"},
    )
    assert resp.status_code == 415


def test_video_upload_oversized(client, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "max_video_size_mb", 0)
    resp = client.post(
        "/api/predict/video",
        files={"file": ("big.mp4", b"12345", "video/mp4")},
        data={"max_frames": "4"},
    )
    assert resp.status_code == 413


def test_video_no_fake_prediction_without_model(client):
    mp4_bytes = _minimal_mp4_bytes()
    resp = client.post(
        "/api/predict/video",
        files={"file": ("test.mp4", mp4_bytes, "video/mp4")},
        data={"max_frames": "4"},
    )
    data = resp.json()
    # No fabricated verdicts
    summary = data.get("summary") or {}
    assert summary.get("verdict") is None or data["status"] != "success"
    # Frame predictions must not contain fabricated labels
    for fp in data.get("frame_predictions", []):
        assert fp.get("predicted_label") is None or fp.get("status") != "success"


def test_video_metadata_response_structure(client):
    mp4_bytes = _minimal_mp4_bytes()
    resp = client.post(
        "/api/predict/video",
        files={"file": ("test.mp4", mp4_bytes, "video/mp4")},
        data={"max_frames": "4"},
    )
    data = resp.json()
    assert "status" in data
    assert "extracted_frames" in data
    assert "frame_predictions" in data
    assert isinstance(data["extracted_frames"], list)
    assert isinstance(data["frame_predictions"], list)


def test_video_history_recorded(client):
    mp4_bytes = _minimal_mp4_bytes()
    client.post(
        "/api/predict/video",
        files={"file": ("history_test.mp4", mp4_bytes, "video/mp4")},
        data={"max_frames": "2"},
    )
    hist = client.get("/api/history").json()
    filenames = [h["filename"] for h in hist["items"]]
    assert "history_test.mp4" in filenames
