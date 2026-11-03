"""
Test configuration for backend/tests.
Sets up PYTHONPATH to include functional-ui-models-backend/backend and configures test environment.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

# Ensure functional-ui-models-backend/backend is in sys.path
backend_dir = Path(__file__).resolve().parent.parent.parent / "functional-ui-models-backend" / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Configure test environment variables BEFORE importing app
_TMP = tempfile.mkdtemp(prefix="mml-ext-test-")
os.environ.setdefault("MML_ENV", "test")
os.environ.setdefault("MML_DETECTOR_BACKEND", "stub")
os.environ.setdefault("MML_DATABASE_URL", f"sqlite:///{_TMP}/test.db")
os.environ.setdefault("MML_REDIS_URL", "redis://unused:6379/0")
os.environ.setdefault("MML_STORAGE_BACKEND", "local")
os.environ.setdefault("MML_STORAGE_ROOT", f"{_TMP}/store")
os.environ.setdefault("MML_TMP_DIR", f"{_TMP}/tmp")

import fakeredis
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.core import redis as redis_mod
from app.core import storage as storage_mod
from app.core.config import settings
from app.db import session as session_mod
from app.db.models import Base
from app.detectors.registry import get_registry
from app.main import app
from app.services import heartbeat
from app.worker.celery_app import celery_app

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
    models = {k: {"name": d.name, "revision": "stub", "loaded": True} for k, d in get_registry().items()}
    heartbeat.publish("test-fast", ["inference.fast"], models)
    heartbeat.publish("test-video", ["inference.video", "maintenance"], models)

    yield r

    get_registry.cache_clear()
    redis_mod.set_redis(None)
    session_mod.set_engine(None)
    storage_mod.set_storage(None)


@pytest.fixture
def client():
    return TestClient(app)
