"""brain – Detection model seam. Swap the real model in by touching only this directory."""

from .interface import (
    BrainError,
    BrainInfo,
    BrainResult,
    BrainUnavailable,
    BrainUnsupported,
    Capabilities,
    DetectionBrain,
    ExplainRegion,
    ExplainResult,
    ModelOutput,
    Signal,
    TimelinePoint,
)
from .registry import get_brain, set_brain

__all__ = [
    "BrainError",
    "BrainInfo",
    "BrainResult",
    "BrainUnavailable",
    "BrainUnsupported",
    "Capabilities",
    "DetectionBrain",
    "ExplainRegion",
    "ExplainResult",
    "ModelOutput",
    "Signal",
    "TimelinePoint",
    "get_brain",
    "set_brain",
]
