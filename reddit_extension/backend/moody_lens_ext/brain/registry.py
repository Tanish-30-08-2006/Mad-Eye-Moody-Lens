"""brain/registry.py – Picks the brain for every request: MML_BRAIN = host | stub | auto (default)."""

from __future__ import annotations

import os
from typing import Optional

from .. import host_compat
from .host_brain import HostBrain, host_pipeline_available
from .interface import BrainUnavailable, DetectionBrain
from .stub_brain import StubBrain

_override: Optional[DetectionBrain] = None


def set_brain(brain: Optional[DetectionBrain]) -> None:
    """Force a brain (tests, or the team's real model at start-up). None restores env-based selection."""
    global _override
    _override = brain


def get_brain(media_type: Optional[str] = None) -> DetectionBrain:
    """The one brain every endpoint uses. Raises BrainUnavailable when nothing can serve this media type."""
    if _override is not None:
        return _override

    mode = os.getenv("MML_BRAIN", "auto").strip().lower()
    if mode == "stub":
        return StubBrain()
    if mode == "host":
        if not host_pipeline_available():
            raise BrainUnavailable("MML_BRAIN=host but the host pipeline is not importable.")
        return HostBrain()
    if mode != "auto":
        raise BrainUnavailable(f"Unknown MML_BRAIN value '{mode}'. Use host, stub or auto.")

    # auto: the host when its workers are up; otherwise only demo data, and only if mock mode is on.
    host = HostBrain() if host_pipeline_available() else None
    if host is not None and host.healthy(media_type):
        return host
    if host is None and host_compat.settings.allow_mock:
        return StubBrain()
    raise BrainUnavailable(
        "Inference backend unavailable: no active workers and mock mode is disabled.",
        "Start the Celery worker or set MML_ALLOW_MOCK=true for demo/mock mode.",
    )
