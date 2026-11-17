"""Detector registry: one shared instance per model per worker process.

Keys match ``GET /api/v1/models`` and the frontend: ``image``, ``face``,
``audio``, ``video`` (``video`` reuses the loaded ``face`` instance, so the
EfficientNet weights sit in memory once).

Which models a worker *loads* depends on its queue (design doc Section 9):
the fast worker needs image + face + audio; the video worker needs face + audio
only, which keeps the Swin model out of its 1.75 GB memory budget.
"""

from __future__ import annotations

import threading
from typing import Any

from app.core.config import settings

QUEUE_MODELS: dict[str, tuple[str, ...]] = {
    "inference.fast": ("image", "face", "audio"),
    "inference.video": ("face", "audio", "video"),
}


_registry: dict[str, Any] | None = None
_registry_lock = threading.Lock()


def get_registry() -> dict[str, Any]:
    """The process-wide registry, built exactly once even under concurrent first calls.

    ``functools.lru_cache`` is not enough here: in a worker the heartbeat thread
    and the model-loading code call this at the same moment on start-up, and two
    racing cache misses each build their own registry – models end up loaded in
    one while heartbeats report the other (seen in the end-to-end run).
    """
    global _registry
    if _registry is None:
        with _registry_lock:
            if _registry is None:
                _registry = _build_registry()
    return _registry


def _reset_registry() -> None:
    """Test hook: drop the registry so the next call rebuilds it."""
    global _registry
    with _registry_lock:
        _registry = None


get_registry.cache_clear = _reset_registry  # type: ignore[attr-defined]  # keeps the lru_cache-style test API


def _build_registry() -> dict[str, Any]:
    """Build (but do not load) every detector for this process."""
    if settings.detector_backend == "stub":
        from app.detectors.stub import (  # noqa: PLC0415
            StubAudioDetector,
            StubFaceDetector,
            StubImageDetector,
            StubVideoDetector,
        )

        face_stub = StubFaceDetector(settings.face_model_id)
        return {
            "image": StubImageDetector(settings.image_model_id),
            "face": face_stub,
            "audio": StubAudioDetector(settings.audio_model_id, window_s=settings.audio_window_s),
            "video": StubVideoDetector(face_stub, settings.video_frames, settings.video_flag_threshold),
        }

    from app.detectors.audio import HFAudioDetector  # noqa: PLC0415
    from app.detectors.face import EfficientNetFaceDetector  # noqa: PLC0415
    from app.detectors.image import HFImageDetector  # noqa: PLC0415
    from app.detectors.video import VideoDetector  # noqa: PLC0415

    face = EfficientNetFaceDetector(
        settings.face_model_id,
        settings.face_model_url,
        sha256=settings.face_model_sha256,
        device=settings.device,
        normalize=settings.face_model_normalize,
        margin=settings.face_margin,
        max_faces=settings.face_max,
    )
    return {
        "image": HFImageDetector(settings.image_model_id, settings.image_model_revision, settings.device),
        "face": face,
        "audio": HFAudioDetector(
            settings.audio_model_id, settings.audio_model_revision, settings.device, settings.audio_window_s
        ),
        "video": VideoDetector(face, settings.video_frames, settings.video_flag_threshold),
    }


def load_for_queues(queues: list[str]) -> list[str]:
    """Load every model the given queues need; returns the registry keys loaded."""
    reg = get_registry()
    keys: list[str] = []
    for q in queues:
        for k in QUEUE_MODELS.get(q, ()):
            if k not in keys:
                keys.append(k)
    for k in keys:
        reg[k].ensure_loaded()
    return keys
