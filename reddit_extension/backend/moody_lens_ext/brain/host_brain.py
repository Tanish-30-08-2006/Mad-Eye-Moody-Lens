"""brain/host_brain.py – The existing host pipeline (RUNNERS / workers) behind the DetectionBrain interface; behaviour unchanged."""

from __future__ import annotations

import time
import uuid
from typing import Optional

from .. import host_compat
from .interface import (
    BrainError,
    BrainInfo,
    BrainResult,
    Capabilities,
    ExplainResult,
    ModelOutput,
)

# Host pipeline task name -> key in our `models` object.
_TASK_TO_MODEL = {
    "ai_generated_image": "image",
    "face_manipulation": "face",
    "synthetic_speech": "audio",
}


def host_pipeline_available() -> bool:
    try:
        from app.services import pipelines  # noqa: F401
        from app.services import heartbeat  # noqa: F401
    except ImportError:
        return False
    return True


def _queue_ready(media_type: Optional[str]) -> bool:
    from app.services import heartbeat

    queue = "inference.video" if media_type == "video" else "inference.fast"
    try:
        return heartbeat.ready_queues().get(queue, 0) > 0
    except Exception:
        return False


class HostBrain:
    def describe(self) -> BrainInfo:
        return BrainInfo(
            name="Host detection pipeline",
            version=str(getattr(host_compat.settings, "version", "host")),
            capabilities=Capabilities(image=True, face=True, audio=True, video=True, explain=False),
            is_mock=self._is_mock(None),
        )

    def healthy(self, media_type: Optional[str] = None) -> bool:
        return _queue_ready(media_type) or bool(host_compat.settings.allow_mock)

    def explain(self, path: str) -> Optional[ExplainResult]:
        return None

    def analyze_image(self, path: str) -> BrainResult:
        return self._run("image", path)

    def analyze_audio(self, path: str) -> BrainResult:
        return self._run("audio", path)

    def analyze_video(self, path: str, audio_path: Optional[str] = None) -> BrainResult:
        # The host's video task takes ONE file; the API has already muxed any separate audio into it.
        return self._run("video", path)

    def _is_mock(self, media_type: Optional[str]) -> bool:
        """Demo data when mock mode is forced or no worker is ready for this queue (today's rule)."""
        return bool(host_compat.settings.allow_mock) or not _queue_ready(media_type)

    def _run(self, media_type: str, path: str) -> BrainResult:
        from app.services.pipelines import RUNNERS

        started = time.perf_counter()
        mock = self._is_mock(media_type)
        runner = RUNNERS.get(media_type)
        if not runner:
            raise BrainError(f"No runner configured for media type: {media_type}")
        try:
            res = runner(path, uuid.uuid4().hex).result
        except host_compat.AnalysisError as exc:
            raise BrainError(exc.message) from exc

        result = BrainResult(
            overall_score=round(res.fake_probability, 4),
            label=label_for_verdict(res.verdict),
            model_versions=res.model_versions or {"detector": "1.0.0"},
            mock=mock,
        )
        for s in res.scores:
            key = _TASK_TO_MODEL.get(s.task)
            if key:
                score = round(s.fake_probability, 4)
                result.models[key] = ModelOutput(
                    score=score,
                    label="fake" if s.fake_probability >= 0.5 else "real",
                    confidence=round(abs(s.fake_probability - 0.5) * 2, 2),
                )
        result.latency_ms = int((time.perf_counter() - started) * 1000)
        return result


def label_for_verdict(verdict: str) -> str:
    if verdict in ("likely_fake", "likely_real"):
        return verdict
    return "inconclusive"
