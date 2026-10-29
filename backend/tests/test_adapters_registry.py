"""Tests for adapter stubs and model registry."""
from __future__ import annotations

import pytest

from app.adapters.audio_ssl_antispoof import SSLAntiSpoofingAdapter
from app.adapters.image_hybrid_vit import HybridXceptionViTAdapter
from app.adapters.video_frame import VideoFrameAdapter
from app.core.exceptions import ModelNotConfiguredError
from app.models.registry import ModelRegistry
from app.models.schemas import ModelStatus


def test_image_adapter_status_not_configured():
    adapter = HybridXceptionViTAdapter()
    assert adapter.get_status() == ModelStatus.NOT_CONFIGURED


def test_audio_adapter_status_not_configured():
    adapter = SSLAntiSpoofingAdapter()
    assert adapter.get_status() == ModelStatus.NOT_CONFIGURED


def test_video_adapter_delegates_to_image():
    image = HybridXceptionViTAdapter()
    video = VideoFrameAdapter(image_adapter=image)
    assert video.get_status() == image.get_status()


def test_image_adapter_predict_raises_not_configured():
    adapter = HybridXceptionViTAdapter()
    with pytest.raises(ModelNotConfiguredError) as exc_info:
        adapter.predict(None)
    assert exc_info.value.model_id == "hybrid_xception_vit"


def test_audio_adapter_predict_raises_not_configured():
    adapter = SSLAntiSpoofingAdapter()
    with pytest.raises(ModelNotConfiguredError) as exc_info:
        adapter.predict(None)
    assert exc_info.value.model_id == "ssl_antispoof_audio"


def test_image_adapter_weight_not_available():
    adapter = HybridXceptionViTAdapter()
    assert adapter.weight_available() is False


def test_audio_adapter_weight_not_available():
    adapter = SSLAntiSpoofingAdapter()
    assert adapter.weight_available() is False


def test_image_adapter_load_is_safe_noop():
    """load() must not raise when no checkpoint is configured."""
    adapter = HybridXceptionViTAdapter()
    adapter.load()  # should not raise


def test_audio_adapter_load_is_safe_noop():
    adapter = SSLAntiSpoofingAdapter()
    adapter.load()  # should not raise


def test_registry_require_unknown_raises():
    reg = ModelRegistry()
    with pytest.raises(KeyError):
        reg.require("nonexistent_model")


def test_registry_configured_count_zero():
    reg = ModelRegistry()
    image = HybridXceptionViTAdapter()
    audio = SSLAntiSpoofingAdapter()
    reg.register(image)
    reg.register(audio)
    assert reg.configured_count() == 0


def test_registry_list_response_structure():
    reg = ModelRegistry()
    image = HybridXceptionViTAdapter()
    reg.register(image)
    lr = reg.list_response()
    assert lr.configured_count == 0
    assert lr.unavailable_count == 1
    assert len(lr.models) == 1


def test_adapter_get_info_fields():
    adapter = HybridXceptionViTAdapter()
    info = adapter.get_info()
    assert info.model_id == "hybrid_xception_vit"
    assert info.modality.value == "image"
    assert isinstance(info.integration_instructions, str)
    assert len(info.integration_instructions) > 50
