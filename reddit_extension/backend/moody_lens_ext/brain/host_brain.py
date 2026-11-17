"""Run the host's existing inference workers behind the DetectionBrain interface."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import time
import uuid
from typing import Optional

from .. import host_compat
from ..services import video_prep
from .interface import (
    BrainError,
    BrainInfo,
    BrainResult,
    Capabilities,
    ExplainResult,
    ModelOutput,
    TimelinePoint,
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


def timeline_from_host(result, media_type: str) -> list[TimelinePoint]:
    """Use measured host ranges only. The host supplies frame ranges for video and windows for audio."""
    if media_type not in {"video", "audio"}:
        return []
    timeline = []
    duration = (getattr(result, "details", None) or {}).get("duration_s")
    for segment in getattr(result, "segments", None) or ():
        start = getattr(segment, "start", None)
        end = getattr(segment, "end", None)
        score = getattr(segment, "fake_probability", None)
        if not all(isinstance(x, (int, float)) and math.isfinite(x) for x in (start, end, score)):
            continue
        if not 0 <= start < end or not 0 <= score <= 1:
            continue
        if isinstance(duration, (int, float)) and duration > 0 and end > duration + 0.001:
            continue
        timeline.append(TimelinePoint(start, end, score))
    return sorted(timeline, key=lambda point: (point.start, point.end))


def _queue_ready(media_type: Optional[str]) -> bool:
    from app.services import heartbeat

    try:
        queues = heartbeat.ready_queues()
        if media_type is None:
            return any(queues.get(q, 0) > 0 for q in ("inference.fast", "inference.video"))
        queue = "inference.video" if media_type == "video" else "inference.fast"
        return queues.get(queue, 0) > 0
    except Exception:
        return False


class HostBrain:
    def describe(self) -> BrainInfo:
        settings = host_compat.settings
        is_mock = self._is_mock()
        fields = (
            "version", "detector_backend", "image_model_id", "image_model_revision", "face_model_id",
            "face_model_url", "face_model_sha256", "face_model_normalize", "audio_model_id", "audio_model_revision",
            "video_frames", "video_flag_threshold", "video_check_audio", "audio_window_s", "face_max", "face_margin",
            "device", "torch_threads", "max_image_pixels", "max_audio_s", "max_video_s", "max_video_height",
            "aggregation", "aggregation_weights", "band_low", "band_high",
        )
        config = {key: getattr(settings, key, None) for key in fields}
        if is_mock:
            config.update({key: os.getenv(key) for key in ("MML_STUB_IMAGE_P", "MML_STUB_FACE_P", "MML_STUB_AUDIO_P")})
        version = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()[:16]
        pinned = all(
            re.fullmatch(pattern, config[key] or "")
            for key, pattern in (
                ("image_model_revision", r"[0-9a-fA-F]{40}"),
                ("face_model_sha256", r"[0-9a-fA-F]{64}"),
                ("audio_model_revision", r"[0-9a-fA-F]{40}"),
            )
        )
        if pinned and not is_mock:
            # During a rollout, a worker on a different artifact must not fill or hit this namespace.
            pinned = all(
                model["model_id"] == info["configured_id"] and model["revision"] == info["configured_revision"]
                for info in self.model_status().values()
                for model in info["loaded"]
            )
        return BrainInfo(
            name="Host detection pipeline",
            version=version,
            capabilities=Capabilities(image=True, face=True, audio=True, video=True, explain=False),
            is_mock=is_mock,
            cacheable=is_mock or pinned or config["detector_backend"] is None,
        )

    def model_status(self) -> dict:
        """Configured identities and worker observations; a missing heartbeat is not a loaded model."""
        from app.services import heartbeat

        settings = host_compat.settings
        if not hasattr(heartbeat, "live_workers"):
            return {}
        from app.detectors.registry import QUEUE_MODELS

        try:
            workers = heartbeat.live_workers()
        except Exception:
            workers = []
        face_pin = f"sha256:{settings.face_model_sha256}" if settings.face_model_sha256 else None
        configured = {
            "image": (settings.image_model_id, settings.image_model_revision),
            "face": (settings.face_model_id, face_pin),
            "audio": (settings.audio_model_id, settings.audio_model_revision),
            "video": (settings.face_model_id, face_pin),
        }
        models = {}
        for kind, (model_id, revision) in configured.items():
            observed = [
                w["models"][kind] for w in workers
                if kind in w.get("models", {}) and any(kind in QUEUE_MODELS.get(q, ()) for q in w["queues"])
            ]
            loaded = sorted({(model["name"], model["revision"]) for model in observed if model["loaded"]})
            models[kind] = {
                "configured_id": model_id,
                "configured_revision": revision,
                "state": "loaded" if loaded else "configured" if observed else "unavailable",
                "loaded": [{"model_id": name, "revision": rev} for name, rev in loaded],
            }
        return models

    def healthy(self, media_type: Optional[str] = None) -> bool:
        return _queue_ready(media_type)

    def explain(self, path: str) -> Optional[ExplainResult]:
        return None

    def analyze_image(self, path: str) -> BrainResult:
        return self._run("image", path)

    def analyze_audio(self, path: str) -> BrainResult:
        return self._run("audio", path)

    def analyze_video(self, path: str, audio_path: Optional[str] = None) -> BrainResult:
        # The host's video task takes ONE file; the API has already muxed any separate audio into it.
        media = None
        if os.path.isfile(path) and video_prep.ffmpeg_available():
            try:
                # Dispatch moves the upload into shared storage, so inspect it before dispatch.
                media = video_prep.probe(path)
            except video_prep.VideoPrepError:
                pass  # The worker still validates/decodes the media.
        result = self._run("video", path)
        if media is not None:
            if not media.has_audio:
                result.models["audio"] = None
            if media.duration_s is not None:
                result.timeline = [p for p in result.timeline if p.end <= media.duration_s + 0.001]
        return result

    def _is_mock(self) -> bool:
        choice = getattr(host_compat.settings, "detector_backend", None)
        return choice == "stub" if choice is not None else bool(host_compat.settings.allow_mock)

    def _host_result(self, media_type: str, path: str):
        # The tiny fake host fixture (no real settings or worker package) supplies only RUNNERS.
        if getattr(host_compat.settings, "detector_backend", None) is None:
            from app.services.pipelines import RUNNERS

            runner = RUNNERS.get(media_type)
            if runner is None:
                raise BrainError(f"No runner configured for media type: {media_type}")
            return runner(path, uuid.uuid4().hex).result

        from app.core.uploads import SavedUpload
        from app.services import dispatch, jobs

        saved = SavedUpload(path=path, kind=media_type, mime="", size=os.path.getsize(path))
        dispatch.ensure_capacity(dispatch.VIDEO if media_type == "video" else dispatch.FAST)
        if media_type != "video":
            return dispatch.run_fast(saved)

        job = dispatch.start_video(saved)
        # Give the demo queue 30 s of headroom beyond the worker's hard limit.
        deadline = time.monotonic() + host_compat.settings.video_time_limit_s + 30
        while True:
            if job.status == "done" and job.result is not None:
                return job.result
            if job.status in {"failed", "done"}:
                raise BrainError(job.error or "The video worker did not return a result.")
            if time.monotonic() >= deadline:
                dispatch.cancel_video(job.job_id)
                raise BrainError("The video analysis took too long.")
            time.sleep(0.5)
            job = jobs.get_job(job.job_id)

    def _run(self, media_type: str, path: str) -> BrainResult:
        started = time.perf_counter()
        try:
            res = self._host_result(media_type, path)
        except host_compat.AnalysisError as exc:
            raise BrainError(exc.message) from exc

        versions = res.model_versions or {}
        result = BrainResult(
            overall_score=round(res.fake_probability, 4),
            label=label_for_verdict(res.verdict),
            model_versions=versions,
            timeline=timeline_from_host(res, media_type),
            mock=self._is_mock() or any(revision.lower() in {"stub", "demo", "mock"} for revision in versions.values()),
        )
        for s in res.scores:
            key = _TASK_TO_MODEL.get(s.task)
            if key:
                score = round(s.fake_probability, 4)
                result.models[key] = ModelOutput(
                    score=score,
                    label="fake" if s.fake_probability >= 0.5 else "real",
                    confidence=round(abs(s.fake_probability - 0.5) * 2, 2),
                    model_id=getattr(s, "model", None),
                )
        result.latency_ms = int((time.perf_counter() - started) * 1000)
        return result


def label_for_verdict(verdict: str) -> str:
    if verdict in ("likely_fake", "likely_real"):
        return verdict
    return "inconclusive"
