"""Custom exception hierarchy for the deepfake detection backend."""
from __future__ import annotations

from typing import Optional


class DeepfakeDetectionError(Exception):
    """Base class for all application errors."""

    def __init__(self, message: str, detail: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.detail = detail


# ── Model errors ─────────────────────────────────────────────────────────────

class ModelNotConfiguredError(DeepfakeDetectionError):
    """Raised when inference is requested but the model is not configured."""

    def __init__(self, model_id: str, reason: str = "Model is not configured"):
        super().__init__(
            message=f"Model '{model_id}' is not available: {reason}",
            detail=reason,
        )
        self.model_id = model_id


class ModelLoadError(DeepfakeDetectionError):
    """Raised when a model fails to load its weights or dependencies."""

    def __init__(self, model_id: str, reason: str):
        super().__init__(
            message=f"Failed to load model '{model_id}': {reason}",
            detail=reason,
        )
        self.model_id = model_id


class ModelInferenceError(DeepfakeDetectionError):
    """Raised when inference fails for a reason other than misconfiguration."""

    def __init__(self, model_id: str, reason: str):
        super().__init__(
            message=f"Inference error in model '{model_id}': {reason}",
            detail=reason,
        )
        self.model_id = model_id


# ── Media errors ─────────────────────────────────────────────────────────────

class MediaValidationError(DeepfakeDetectionError):
    """Raised when an uploaded file fails format or size validation."""


class UnsupportedFormatError(MediaValidationError):
    """Raised when a file's MIME type or extension is not supported."""

    def __init__(self, received: str, supported: list[str]):
        super().__init__(
            message=f"Unsupported format '{received}'. Supported: {', '.join(supported)}"
        )
        self.received = received
        self.supported = supported


class FileTooLargeError(MediaValidationError):
    """Raised when an uploaded file exceeds the configured size limit."""

    def __init__(self, size_bytes: int, limit_bytes: int):
        size_mb = size_bytes / (1024 * 1024)
        limit_mb = limit_bytes / (1024 * 1024)
        super().__init__(
            message=f"File size {size_mb:.1f} MB exceeds limit of {limit_mb:.1f} MB"
        )


class MediaProcessingError(DeepfakeDetectionError):
    """Raised when media decoding or processing fails."""


# ── General errors ────────────────────────────────────────────────────────────

class NotFoundError(DeepfakeDetectionError):
    """Raised when a requested resource does not exist."""
