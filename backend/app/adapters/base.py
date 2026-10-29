"""
Base adapter interface.

Every model adapter must subclass BaseModelAdapter and implement
the abstract methods listed below. Concrete adapters for unconfigured
models must raise ModelNotConfiguredError from predict() and similar
methods rather than returning fabricated results.
"""
from __future__ import annotations

import abc
from typing import Any, Dict, Optional

from app.models.schemas import ModelInfo, ModelStatus, Modality


class BaseModelAdapter(abc.ABC):
    """Abstract base class for all deepfake detection model adapters."""

    # Subclasses must set these class-level attributes.
    model_id: str = ""
    name: str = ""
    modality: Modality = Modality.IMAGE
    framework: Optional[str] = None
    expected_input: str = ""
    configuration_notes: str = ""
    integration_instructions: str = ""

    def __init__(self) -> None:
        self._loaded: bool = False
        self._error: Optional[str] = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def load(self) -> None:
        """
        Load model weights and initialise the runtime.

        Subclasses should override this. The base implementation is a no-op
        so unconfigured adapters do not crash at import time.
        """

    def close(self) -> None:
        """Release resources. Override when needed."""
        self._loaded = False

    # ── Status ────────────────────────────────────────────────────────────────

    @abc.abstractmethod
    def get_status(self) -> ModelStatus:
        """Return the current lifecycle status of this adapter."""

    @abc.abstractmethod
    def weight_available(self) -> bool:
        """Return True only when the checkpoint file actually exists."""

    @abc.abstractmethod
    def runtime_available(self) -> bool:
        """Return True only when all runtime dependencies are importable."""

    def get_info(self) -> ModelInfo:
        return ModelInfo(
            model_id=self.model_id,
            name=self.name,
            modality=self.modality,
            framework=self.framework,
            status=self.get_status(),
            weight_available=self.weight_available(),
            runtime_available=self.runtime_available(),
            expected_input=self.expected_input,
            configuration_notes=self.configuration_notes,
            integration_instructions=self.integration_instructions,
        )

    # ── Inference pipeline ────────────────────────────────────────────────────

    @abc.abstractmethod
    def health_check(self) -> Dict[str, Any]:
        """
        Run a lightweight readiness check.
        Returns a dict with at least {"healthy": bool, "detail": str}.
        """

    @abc.abstractmethod
    def preprocess(self, raw_input: Any) -> Any:
        """Convert raw uploaded bytes / path into model-ready tensors."""

    @abc.abstractmethod
    def predict(self, preprocessed: Any) -> Dict[str, Any]:
        """
        Run inference and return a raw result dict.
        Must raise ModelNotConfiguredError when the model is not ready.
        """

    def postprocess(self, raw_result: Dict[str, Any]) -> Dict[str, Any]:
        """Convert raw model output into schema-compatible dict."""
        return raw_result

    def explain(self, preprocessed: Any, raw_result: Dict[str, Any]) -> Optional[Any]:
        """
        Return an explanation artifact (e.g. GradCAM heatmap).
        Default implementation returns None (not supported).
        """
        return None
