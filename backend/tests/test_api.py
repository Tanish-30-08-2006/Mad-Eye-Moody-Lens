"""Unit tests for the Mad-Eye Moody Lens backend API."""

import io
from fastapi.testclient import TestClient
import numpy as np
from PIL import Image
import pytest

from app.main import app

client = TestClient(app)


def create_test_image(size=(128, 128), color=(180, 100, 100)) -> bytes:
    """Creates a temporary PNG image in memory for testing."""
    img = Image.new("RGB", size, color=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "device" in data


def test_models():
    response = client.get("/api/models")
    assert response.status_code == 200
    data = response.json()
    assert "primary_model" in data
    assert "features" in data
    assert len(data["features"]) > 0


def test_analyze_file_upload():
    img_bytes = create_test_image()
    response = client.post(
        "/api/analyze",
        files={"file": ("test.png", img_bytes, "image/png")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "is_ai_generated" in data
    assert "fake_probability" in data
    assert "confidence_score" in data
    assert "verdict" in data
    assert "manipulation_type" in data
    assert "processing_time_ms" in data


def test_analyze_advanced_file_upload():
    img_bytes = create_test_image()
    response = client.post(
        "/api/analyze-advanced",
        files={"file": ("test.png", img_bytes, "image/png")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "manipulation_scope" in data
    assert data["manipulation_scope"] in ["entire_image", "partial", "authentic"]
    assert "scope_verdict" in data
    assert "ai_area_percentage" in data
    assert 0.0 <= data["ai_area_percentage"] <= 100.0
    assert "heatmap_overlay_base64" in data
    assert data["heatmap_overlay_base64"].startswith("data:image/png;base64,")
    assert "blended_image_base64" in data
    assert data["blended_image_base64"].startswith("data:image/png;base64,")
    assert "patch_grid" in data
    assert len(data["patch_grid"]) == 4
    assert "highlighted_regions" in data
    assert "detailed_explanation" in data


def test_analyze_base64_payload():
    import base64
    img_bytes = create_test_image()
    b64 = base64.b64encode(img_bytes).decode("utf-8")
    response = client.post(
        "/api/analyze",
        json={"image_base64": f"data:image/png;base64,{b64}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "fake_probability" in data
