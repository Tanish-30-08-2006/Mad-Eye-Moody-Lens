"""Detector interface and label mapping (design doc Section 3).

Every model sits behind :class:`Detector`, so swapping a model is a config
change. Heavy libraries (torch, transformers, librosa, OpenCV) are imported
inside ``load()`` / methods only: the API process imports this module for
type hints without pulling PyTorch into memory.
"""

from __future__ import annotations

import re
import threading
from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

# Tokens that identify a "fake" vs "real" class across model vocabularies
# (fake/real, artificial/human, spoof/bonafide, ...). REAL wins on overlap.
FAKE_TOKENS = {"fake", "artificial", "ai", "synthetic", "deepfake", "spoof", "generated", "manipulated"}
REAL_TOKENS = {"real", "human", "bonafide", "bona", "authentic", "genuine", "original"}


def label_is_fake(label: str) -> bool:
    """Map a model's class label to fake (True) / real (False); unknown labels raise."""
    tokens = set(re.split(r"[^a-z]+", label.lower()))
    if tokens & REAL_TOKENS:
        return False
    if tokens & FAKE_TOKENS:
        return True
    raise ValueError(f"Cannot map label {label!r} to real/fake; add it to FAKE_TOKENS or REAL_TOKENS.")


def fake_prob_from_scores(scores: list[dict[str, Any]]) -> float:
    """scores: [{'label': ..., 'score': ...}, ...] from a HF pipeline (all classes)."""
    p = sum(float(s["score"]) for s in scores if label_is_fake(str(s["label"])))
    return float(min(max(p, 0.0), 1.0))


def check_label_map(id2label: dict[int, str]) -> None:
    """Start-up self-check: every label must map, and exactly one side must be fake.

    Run once when a worker loads a model; a failure keeps ``loaded=False`` so an
    inverted or unknown model can never silently flip verdicts.
    """
    mapped = [label_is_fake(lbl) for lbl in id2label.values()]
    if not any(mapped) or all(mapped):
        raise ValueError(f"Label map {id2label} must contain both a fake and a real class.")


@dataclass
class SegmentScore:
    start: float  # seconds
    end: float
    fake_probability: float


@dataclass
class DetectionResult:
    fake_probability: float
    model_name: str
    segments: list[SegmentScore] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class FaceScore:
    """One scored face: its crop box in original pixels, its score and the crop.

    The crop lives in memory only (for Grad-CAM in the same task) and is never stored.
    """

    box: tuple[int, int, int, int]
    fake_probability: float
    crop: Any = None  # PIL.Image.Image


@dataclass
class FrameFaces:
    time_s: float
    faces: list[FaceScore]

    @property
    def max_probability(self) -> float:
        return max(f.fake_probability for f in self.faces)


@dataclass
class VideoAnalysis:
    result: DetectionResult
    frames: list[FrameFaces]


ProgressFn = Callable[[float], None]
CancelFn = Callable[[], bool]


class Detector(ABC):
    """Base class: thread-safe lazy loading + identity for heartbeats and results."""

    name: str = "unnamed"
    media_type: str = "unknown"
    revision: str = "unpinned"

    def __init__(self) -> None:
        self._loaded = False
        self._lock = threading.Lock()

    @property
    def loaded(self) -> bool:
        return self._loaded

    def ensure_loaded(self) -> None:
        # Double-checked locking: concurrent first calls load the model once.
        if self._loaded:
            return
        with self._lock:
            if not self._loaded:
                self.load()
                self._loaded = True

    @abstractmethod
    def load(self) -> None: ...
