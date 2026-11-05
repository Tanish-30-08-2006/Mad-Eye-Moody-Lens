"""brain/stub_brain.py – Deterministic demo brain: same bytes give the same result, and every result is marked mock."""

from __future__ import annotations

import hashlib
import time
from typing import Dict, List, Optional

from ..services import video_prep
from .interface import (
    BrainInfo,
    BrainResult,
    Capabilities,
    ExplainResult,
    ModelOutput,
    Signal,
    TimelinePoint,
    label_for,
)

STUB_VERSION = "0.1.0"
_TIMELINE_SEGMENTS = 8
_FALLBACK_DURATION_S = 8.0
_HASH_BYTES = 4 * 1024 * 1024  # enough to tell files apart without reading huge videos fully


def _digest(path: str) -> bytes:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        h.update(fh.read(_HASH_BYTES))
    return h.digest()


def _unit(digest: bytes, salt: int) -> float:
    """A repeatable pseudo-random number in [0, 1) derived from the file and a salt."""
    chunk = hashlib.sha256(digest + bytes([salt])).digest()
    return int.from_bytes(chunk[:4], "big") / 2**32


def _model(score: float) -> ModelOutput:
    return ModelOutput(score=score, label="fake" if score >= 0.5 else "real", confidence=round(abs(score - 0.5) * 2, 2))


class StubBrain:
    """Not a detector: it exists so the whole pipeline can be exercised before the real model is linked."""

    def describe(self) -> BrainInfo:
        return BrainInfo(
            name="Moody Lens demo stub",
            version=STUB_VERSION,
            capabilities=Capabilities(image=True, face=False, audio=True, video=True, explain=False),
            is_mock=True,
        )

    def healthy(self, media_type: Optional[str] = None) -> bool:
        return True

    def explain(self, path: str) -> Optional[ExplainResult]:
        return None

    def analyze_image(self, path: str) -> BrainResult:
        started = time.perf_counter()
        digest = _digest(path)
        score = round(_unit(digest, 0), 4)
        return self._result(score, {"image": _model(score)}, started, digest)

    def analyze_audio(self, path: str) -> BrainResult:
        started = time.perf_counter()
        digest = _digest(path)
        score = round(_unit(digest, 1), 4)
        return self._result(score, {"audio": _model(score)}, started, digest)

    def analyze_video(self, path: str, audio_path: Optional[str] = None) -> BrainResult:
        started = time.perf_counter()
        digest = _digest(path)
        score = round(_unit(digest, 2), 4)
        # Only models that "ran" get an entry: frames always, audio only when a track was supplied.
        models: Dict[str, Optional[ModelOutput]] = {"image": _model(score)}
        if audio_path:
            models["audio"] = _model(round(_unit(_digest(audio_path), 3), 4))
        result = self._result(score, models, started, digest)
        result.timeline = self._timeline(path, digest, score)
        return result

    def _timeline(self, path: str, digest: bytes, overall: float) -> List[TimelinePoint]:
        duration = _FALLBACK_DURATION_S
        if video_prep.ffmpeg_available():
            try:
                probed = video_prep.probe(path).duration_s
                if probed:
                    duration = probed
            except video_prep.VideoPrepError:
                pass
        step = duration / _TIMELINE_SEGMENTS
        points = []
        for i in range(_TIMELINE_SEGMENTS):
            jitter = (_unit(digest, 10 + i) - 0.5) * 0.3
            points.append(
                TimelinePoint(start=round(i * step, 2), end=round((i + 1) * step, 2), score=round(min(1.0, max(0.0, overall + jitter)), 4))
            )
        return points

    def _result(self, score: float, models: Dict[str, Optional[ModelOutput]], started: float, digest: bytes) -> BrainResult:
        label = label_for(score)
        result = BrainResult(overall_score=score, label=label, mock=True)
        result.models.update(models)
        result.model_versions = {"stub": STUB_VERSION}
        result.signals = [
            Signal(kind="demo", text="Demo data: this result comes from a stand-in, not a real analysis.", severity="info"),
            Signal(
                kind="demo",
                text="Demo data: placeholder signal used to exercise the interface.",
                severity="high" if label == "likely_fake" else "low",
            ),
        ]
        result.latency_ms = int((time.perf_counter() - started) * 1000)
        return result
