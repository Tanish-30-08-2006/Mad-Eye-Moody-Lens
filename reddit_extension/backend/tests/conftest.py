"""Test harness for reddit_extension backend tests.

Sets up sys.path for moody_lens_ext and functional-ui-models-backend/backend,
initializes test configuration with stub detectors, fakeredis, SQLite, and
provides test client fixtures.
"""

from __future__ import annotations

import io
import os
import sys
import tempfile
from pathlib import Path

# Ensure moody_lens_ext and host app are in sys.path before imports
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_HOST_DIR = _BACKEND_DIR.parent.parent / "functional-ui-models-backend" / "backend"

for p in (str(_BACKEND_DIR), str(_HOST_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

# Configure environment BEFORE any app import: settings are read once at import time.
_TMP = tempfile.mkdtemp(prefix="mml-ext-test-")
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
import pytest  # noqa: E402
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

    return TestClient(app)
