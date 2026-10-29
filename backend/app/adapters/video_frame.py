"""
Video Frame Analysis Adapter
=============================
This adapter delegates per-frame inference to the registered image adapter
(HybridXceptionViTAdapter). It does NOT load a second copy of the model.

When no image adapter is configured, video frame inference is also unavailable,
and this adapter raises ModelNotConfiguredError accordingly.
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from app.adapters.base import BaseModelAdapter
from app.core.exceptions import ModelNotConfiguredError
from app.models.schemas import ModelStatus, Modality

logger = logging.getLogger(__name__)

_INTEGRATION_INSTRUCTIONS = """
Video frame inference is automatically enabled when the Hybrid Xception-ViT
image adapter is configured. No separate setup is required.

Steps:
1. Configure the Hybrid Xception-ViT image adapter (see its instructions).
2. The video service will call this adapter's predict() for each extracted frame.
3. Optional audio analysis for videos uses the SSL Anti-Spoofing audio adapter.
4. Document your frame-aggregation strategy (e.g. mean score, majority vote)
   in backend/app/services/video.py under _aggregate_frame_results().
"""


class VideoFrameAdapter(BaseModelAdapter):
    """
    Adapter that routes per-frame inference to the registered image model.

    The image_adapter reference is injected at startup from the registry.
    """

    model_id = "video_frame_analysis"
    name = "Video Frame Analysis (via Hybrid Xception-ViT)"
    modality = Modality.VIDEO
    framework = "Delegates to image adapter"
    expected_input = "Individual video frames (RGB images) at configured sampling interval"
    configuration_notes = (
        "This adapter reuses the Hybrid Xception-ViT image adapter. "
        "Configure that model first."
    )
    integration_instructions = _INTEGRATION_INSTRUCTIONS

    def __init__(self, image_adapter: BaseModelAdapter) -> None:
        super().__init__()
        self._image_adapter = image_adapter

    # ── Status ────────────────────────────────────────────────────────────────

    def weight_available(self) -> bool:
        return self._image_adapter.weight_available()

    def runtime_available(self) -> bool:
        return self._image_adapter.runtime_available()

    def get_status(self) -> ModelStatus:
        return self._image_adapter.get_status()

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def load(self) -> None:
        # The image adapter is loaded independently; nothing to do here.
        pass

    # ── Inference ─────────────────────────────────────────────────────────────

    def health_check(self) -> Dict[str, Any]:
        return self._image_adapter.health_check()

    def preprocess(self, raw_input: Any) -> Any:
        return self._image_adapter.preprocess(raw_input)

    def predict(self, preprocessed: Any) -> Dict[str, Any]:
        return self._image_adapter.predict(preprocessed)

    def postprocess(self, raw_result: Dict[str, Any]) -> Dict[str, Any]:
        return self._image_adapter.postprocess(raw_result)

    def explain(self, preprocessed: Any, raw_result: Dict[str, Any]) -> Any:
        return self._image_adapter.explain(preprocessed, raw_result)
