"""Contract test: the bot's real client against the real host API, in process.

Uses the host backend (functional-ui-models-backend/backend) with stub detectors, eager
Celery, SQLite and fakeredis, exactly like the host's own suite. Skipped when the host or its
dependencies are not importable (run it with the host's virtualenv).
"""

from __future__ import annotations

import asyncio
import io
import json
import os
import sys
import tempfile
from pathlib import Path

import pytest

HOST = Path(__file__).resolve().parents[2] / "functional-ui-models-backend" / "backend"
_TMP = tempfile.mkdtemp(prefix="mml-bot-test-")
os.environ.update(
    {
        "MML_ENV": "test",
        "MML_DETECTOR_BACKEND": "stub",
        "MML_DATABASE_URL": f"sqlite:///{_TMP}/t.db",
        "MML_REDIS_URL": "redis://unused:6379/0",
        "MML_STORAGE_BACKEND": "local",
        "MML_STORAGE_ROOT": f"{_TMP}/store",
        "MML_TMP_DIR": f"{_TMP}/tmp",
    }
)
if str(HOST) not in sys.path:
    sys.path.append(str(HOST))
for mod in ("fakeredis", "sqlalchemy", "soundfile", "celery"):
    pytest.importorskip(mod)
pytest.importorskip("app.main")  # the host package

import httpx  # noqa: E402
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from PIL import Image  # noqa: E402


@pytest.fixture
def host_app(tmp_path):
    import fakeredis
    from app.core import redis as redis_mod
    from app.core import storage as storage_mod
    from app.db import session as session_mod
    from app.db.models import Base
    from app.detectors.registry import get_registry
    from app.main import app
    from app.services import heartbeat
    from app.worker.celery_app import celery_app
    from sqlalchemy import create_engine
    from sqlalchemy.pool import StaticPool

    celery_app.conf.update(task_always_eager=True, task_eager_propagates=False)
    redis_mod.set_redis(fakeredis.FakeRedis(decode_responses=True))
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session_mod.set_engine(engine)
    storage_mod.set_storage(storage_mod.LocalStorage(str(tmp_path / "store")))
    get_registry.cache_clear()
    models = {k: {"name": d.name, "revision": "stub", "loaded": True} for k, d in get_registry().items()}
    heartbeat.publish("bot-fast", ["inference.fast"], models)
    heartbeat.publish("bot-video", ["inference.video", "maintenance"], models)
    yield app
    redis_mod.set_redis(None)
    session_mod.set_engine(None)
    storage_mod.set_storage(None)


def _bot_client(app):
    from mml_bot import client as mod

    return mod, mod.MoodyLensClient("http://host/api/v1", transport=httpx.ASGITransport(app=app))


def test_image_audio_and_status_through_the_real_api(host_app):
    from mml_bot.reports import scan_report_json

    mod, client = _bot_client(host_app)
    png = io.BytesIO()
    Image.new("RGB", (96, 96), (120, 30, 200)).save(png, "PNG")
    wav = io.BytesIO()
    t = np.linspace(0, 5, 16000 * 5, endpoint=False)
    sf.write(wav, (0.1 * np.sin(2 * np.pi * 220 * t)).astype("float32"), 16000, format="WAV")

    async def run():
        image = await client.analyze("image", png.getvalue())
        audio = await client.analyze("audio", wav.getvalue())
        stored_audio = await client.get_analysis(audio["analysis_id"])
        ready, _ = await client.ready()
        models = await client.models()
        with pytest.raises(mod.ApiError) as bad:
            await client.analyze("image", b"not an image at all")
        await client.aclose()
        return image, audio, stored_audio, ready, models, bad.value

    image, audio, stored_audio, ready, models, bad = asyncio.run(run())
    assert image["media_type"] == "image" and image["verdict"] in {"likely_real", "uncertain", "likely_fake"}
    assert audio["details"]["duration_s"] == 5.0 and audio["segments"]
    report = json.loads(scan_report_json(stored_audio))
    assert report["coverage"] == {"duration_s": 5.0}
    assert report["segment_type"] == "speech_window"
    assert report["segments"][0]["fake_probability"] == audio["segments"][0]["fake_probability"]
    assert ready is True and {m["key"] for m in models} >= {"image", "face", "audio"}
    assert bad.status == 415 and bad.message  # the API's own plain-language message
