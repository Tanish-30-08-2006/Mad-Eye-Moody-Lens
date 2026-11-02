"""Test harness: stub detectors, eager Celery, SQLite, fakeredis, temp storage.

No model weights are downloaded and PyTorch is never imported, so the whole
suite runs in CI in seconds (design doc Section 12).
"""

from __future__ import annotations

import io
import os
import shutil
import subprocess
import tempfile

# Configure BEFORE any app import: settings are read once at import time.
_TMP = tempfile.mkdtemp(prefix="mml-test-")
os.environ.update(
    {
        "MML_ENV": "test",
        "MML_DETECTOR_BACKEND": "stub",
        "MML_DATABASE_URL": f"sqlite:///{_TMP}/test.db",
        "MML_REDIS_URL": "redis://unused:6379/0",
        "MML_STORAGE_BACKEND": "local",
        "MML_STORAGE_ROOT": f"{_TMP}/store",
        "MML_TMP_DIR": f"{_TMP}/tmp",
    }
)

import fakeredis  # noqa: E402
import numpy as np  # noqa: E402
import pytest  # noqa: E402
import soundfile as sf  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core import redis as redis_mod  # noqa: E402
from app.core import storage as storage_mod  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.db import session as session_mod  # noqa: E402
from app.db.models import Base  # noqa: E402
from app.detectors.registry import get_registry  # noqa: E402
from app.services import heartbeat  # noqa: E402
from app.worker.celery_app import celery_app  # noqa: E402

celery_app.conf.update(task_always_eager=True, task_eager_propagates=False)


@pytest.fixture(autouse=True)
def infra(tmp_path, monkeypatch):
    """Fresh Redis, database and storage for every test."""
    r = fakeredis.FakeRedis(decode_responses=True)
    redis_mod.set_redis(r)

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session_mod.set_engine(engine)

    store = tmp_path / "store"
    storage_mod.set_storage(storage_mod.LocalStorage(str(store)))
    monkeypatch.setattr(settings, "tmp_dir", str(tmp_path / "tmp"))

    get_registry.cache_clear()
    yield r
    get_registry.cache_clear()
    redis_mod.set_redis(None)
    session_mod.set_engine(None)
    storage_mod.set_storage(None)


@pytest.fixture
def workers_up(infra):
    """Publish heartbeats as if a fast and a video worker had loaded their models."""
    models = {k: {"name": d.name, "revision": "stub", "loaded": True} for k, d in get_registry().items()}
    heartbeat.publish("test-fast", ["inference.fast"], models)
    heartbeat.publish("test-video", ["inference.video", "maintenance"], models)


@pytest.fixture
def client(workers_up):
    from app.main import app

    return TestClient(app)  # no `with`: lifespan logging setup is not needed


@pytest.fixture
def store_root():
    return storage_mod.get_storage().root  # type: ignore[attr-defined]


# ------------------------------------------------------------------ media
def png_bytes(size=(96, 96)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (120, 30, 200)).save(buf, "PNG")
    return buf.getvalue()


def wav_bytes(seconds: float = 9.0) -> bytes:
    buf = io.BytesIO()
    t = np.linspace(0, seconds, int(16000 * seconds), endpoint=False)
    sf.write(buf, (0.1 * np.sin(2 * np.pi * 220 * t)).astype("float32"), 16000, format="WAV")
    return buf.getvalue()


@pytest.fixture(scope="session")
def mp4_bytes() -> bytes:
    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg not installed")
    out = os.path.join(_TMP, "clip.mp4")
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=2:size=320x240:rate=12",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=2",
            "-shortest",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            out,
        ],
        check=True,
    )
    with open(out, "rb") as fh:
        return fh.read()
