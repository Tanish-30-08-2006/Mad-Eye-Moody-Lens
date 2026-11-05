"""brain/interface.py – The seam between the extension API and the detection model; link the real model by implementing DetectionBrain."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Protocol, runtime_checkable

LABELS = ("likely_real", "likely_fake", "inconclusive")
MODEL_KEYS = ("image", "face", "audio")
SEVERITIES = ("info", "low", "medium", "high")

# Default score cut-offs for turning a probability into a label (the extension lets users tune its own).
FAKE_AT = 0.7
REAL_AT = 0.3


def label_for(score: float) -> str:
    if score >= FAKE_AT:
        return "likely_fake"
    if score <= REAL_AT:
        return "likely_real"
    return "inconclusive"


class BrainError(Exception):
    """The brain could not analyse this input; `message` is safe to show to the client."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class BrainUnsupported(BrainError):
    """The brain does not offer this capability (see BrainInfo.capabilities)."""


class BrainUnavailable(Exception):
    """No usable brain right now (for example: no workers and mock mode off). The API answers 503."""

    def __init__(self, message: str, detail: Optional[str] = None) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail


@dataclass(frozen=True)
class ModelOutput:
    score: float  # probability the media is manipulated, 0..1
    label: str
    confidence: float  # 0..1


@dataclass(frozen=True)
class TimelinePoint:
    start: float  # seconds
    end: float
    score: float


@dataclass(frozen=True)
class Signal:
    kind: str
    text: str
    severity: str  # one of SEVERITIES


def _no_models() -> Dict[str, Optional[ModelOutput]]:
    return {key: None for key in MODEL_KEYS}


@dataclass
class BrainResult:
    """Outcome of one analysis. A model that did not run is None; scores are never invented."""

    overall_score: float
    label: str
    models: Dict[str, Optional[ModelOutput]] = field(default_factory=_no_models)
    model_versions: Dict[str, str] = field(default_factory=dict)
    timeline: List[TimelinePoint] = field(default_factory=list)  # video only
    signals: List[Signal] = field(default_factory=list)
    latency_ms: int = 0
    mock: bool = False  # True means demo data; the API passes it through untouched


@dataclass(frozen=True)
class ExplainRegion:
    x: float  # all normalised 0..1 relative to the image
    y: float
    w: float
    h: float
    score: float
    note: str = ""


@dataclass(frozen=True)
class ExplainResult:
    summary: str
    regions: List[ExplainRegion] = field(default_factory=list)
    mock: bool = False


@dataclass(frozen=True)
class Capabilities:
    image: bool = False
    face: bool = False
    audio: bool = False
    video: bool = False
    explain: bool = False


@dataclass(frozen=True)
class BrainInfo:
    name: str
    version: str
    capabilities: Capabilities
    is_mock: bool


@runtime_checkable
class DetectionBrain(Protocol):
    """Everything the API needs from a detector. Paths are local temp files the API deletes afterwards."""

    def analyze_image(self, path: str) -> BrainResult: ...

    def analyze_video(self, path: str, audio_path: Optional[str] = None) -> BrainResult:
        """`path` is the (already muxed) video; `audio_path` is the separate audio track when one was uploaded."""
        ...

    def analyze_audio(self, path: str) -> BrainResult: ...

    def explain(self, path: str) -> Optional[ExplainResult]:
        """None when the brain has no explanation (capabilities.explain is False)."""
        ...

    def describe(self) -> BrainInfo: ...

    def healthy(self, media_type: Optional[str] = None) -> bool:
        """True when a scan of this media type could run right now."""
        ...
