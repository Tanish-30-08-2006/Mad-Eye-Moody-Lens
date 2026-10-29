"""Tests for health and model-list endpoints."""
from __future__ import annotations


def test_health_endpoint(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "models_configured" in data
    assert "models_unavailable" in data
    assert isinstance(data["models_configured"], int)
    assert isinstance(data["models_unavailable"], int)


def test_models_list(client):
    resp = client.get("/api/models")
    assert resp.status_code == 200
    data = resp.json()
    assert "models" in data
    assert isinstance(data["models"], list)
    # All three adapters should be registered
    model_ids = {m["model_id"] for m in data["models"]}
    assert "hybrid_xception_vit" in model_ids
    assert "ssl_antispoof_audio" in model_ids
    assert "video_frame_analysis" in model_ids


def test_model_detail_image(client):
    resp = client.get("/api/models/hybrid_xception_vit")
    assert resp.status_code == 200
    data = resp.json()
    assert data["model_id"] == "hybrid_xception_vit"
    assert data["modality"] == "image"
    assert data["status"] != "ready"  # No checkpoint available in test env
    assert "weight_available" in data
    assert "runtime_available" in data
    assert "integration_instructions" in data


def test_model_detail_audio(client):
    resp = client.get("/api/models/ssl_antispoof_audio")
    assert resp.status_code == 200
    data = resp.json()
    assert data["model_id"] == "ssl_antispoof_audio"
    assert data["modality"] == "audio"


def test_model_detail_video(client):
    resp = client.get("/api/models/video_frame_analysis")
    assert resp.status_code == 200
    data = resp.json()
    assert data["model_id"] == "video_frame_analysis"
    assert data["modality"] == "video"


def test_unknown_model_id(client):
    resp = client.get("/api/models/does_not_exist")
    assert resp.status_code == 404


def test_no_model_is_ready_without_checkpoint(client):
    """Without checkpoints, no model should report 'ready' status."""
    resp = client.get("/api/models")
    assert resp.status_code == 200
    for model in resp.json()["models"]:
        assert model["status"] != "ready", (
            f"Model '{model['model_id']}' reports 'ready' without a checkpoint – "
            "check the adapter implementation."
        )


def test_configured_count_is_zero_without_checkpoint(client):
    """configured_count must be 0 when no checkpoints are present."""
    resp = client.get("/api/models")
    assert resp.json()["configured_count"] == 0
