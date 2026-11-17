"""Worker heartbeats -> ``GET /models`` and ``GET /ready`` (design doc Section 3).

The API process never loads a model, so it cannot know load state itself.
Each worker publishes ``worker:<id>`` every 10 s (TTL 30 s) with its queues and
the models it has loaded. A dead worker simply disappears when its key expires.
"""

from __future__ import annotations

import json
import os
import socket
import threading
import time
import uuid
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.core.redis import get_redis
from app.detectors.registry import QUEUE_MODELS

log = get_logger(__name__)

MODEL_KEYS: tuple[str, ...] = ("image", "face", "audio", "video")
MEDIA_TYPE = {"image": "image", "face": "face", "audio": "audio", "video": "video"}


def worker_id() -> str:
    return f"{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:6]}"


def publish(wid: str, queues: list[str], models: dict[str, dict[str, Any]]) -> None:
    payload = {"queues": queues, "models": models, "ts": time.time()}
    get_redis().set(f"worker:{wid}", json.dumps(payload), ex=settings.heartbeat_ttl_s)


def start_heartbeat_thread(wid: str, queues: list[str], snapshot) -> threading.Thread:  # type: ignore[no-untyped-def]
    """Daemon thread publishing ``snapshot()`` every ``heartbeat_interval_s``."""

    def loop() -> None:
        while True:
            try:
                publish(wid, queues, snapshot())
            except Exception:  # noqa: BLE001 – Redis blips must not kill the worker
                log.warning("heartbeat_failed", exc_info=True)
            time.sleep(settings.heartbeat_interval_s)

    t = threading.Thread(target=loop, name="mml-heartbeat", daemon=True)
    t.start()
    return t


def live_workers() -> list[dict[str, Any]]:
    r = get_redis()
    out = []
    for key in r.scan_iter("worker:*", count=100):
        raw = r.get(key)
        if raw:
            try:
                out.append(json.loads(raw))
            except json.JSONDecodeError:
                continue
    return out


def models_view() -> list[dict[str, Any]]:
    """Shape of ``GET /models``: one entry per registry key, loaded if any worker has it."""
    names = {
        "image": settings.image_model_id,
        "face": settings.face_model_id,
        "audio": settings.audio_model_id,
        "video": settings.face_model_id,  # composite over the face model
    }
    workers = live_workers()
    view = []
    for key in MODEL_KEYS:
        loaded = any(w.get("models", {}).get(key, {}).get("loaded") for w in workers)
        reported = next((w["models"][key]["name"] for w in workers if key in w.get("models", {})), None)
        view.append({"key": key, "name": reported or names[key], "media_type": MEDIA_TYPE[key], "loaded": bool(loaded)})
    return view


def ready_queues() -> dict[str, int]:
    """Workers per queue that have every model the queue needs loaded."""
    counts = {q: 0 for q in QUEUE_MODELS}
    for w in live_workers():
        models = w.get("models", {})
        for q in w.get("queues", []):
            if q in counts and all(models.get(k, {}).get("loaded") for k in QUEUE_MODELS[q]):
                counts[q] += 1
    return counts
