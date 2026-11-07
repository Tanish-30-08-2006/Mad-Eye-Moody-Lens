from fastapi.testclient import TestClient

from app.main import app


def test_health_and_model_catalogue_are_available_without_loading_torch():
    with TestClient(app) as client:
        health = client.get("/api/health")
        models = client.get("/api/models")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert models.status_code == 200
    assert any(model["id"] == "iapl-sd14" for model in models.json())
