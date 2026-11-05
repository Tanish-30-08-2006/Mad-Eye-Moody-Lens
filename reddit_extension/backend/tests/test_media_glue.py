"""
tests/test_media_glue.py – Wiring of moody_lens_ext.media (audio mux, detect-url, health mock flag).

Label: RUNTIME with a FAKE HOST. The real host (`app.*`) is not in this repo, so a tiny stand-in
package implementing only the interfaces media.py already imports is installed for these tests.
Real ffmpeg is used when available. Skipped when the real host is importable (the real
test_media_api.py covers that case) or when ffmpeg is missing.
"""

from __future__ import annotations

import glob
import importlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import types
from pathlib import Path
from types import SimpleNamespace

import pytest

try:
    import app.main  # noqa: F401

    pytest.skip("real host backend present; covered by test_media_api.py", allow_module_level=True)
except ImportError:
    pass

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from moody_lens_ext.services import video_prep, url_resolver  # noqa: E402

needs_ffmpeg = pytest.mark.skipif(not video_prep.ffmpeg_available(), reason="ffmpeg/ffprobe not installed")


class FakeAnalysisError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _forget_extension_modules():
    """Drop modules that bound the previous (fake) host; services stay so monkeypatches on them keep working."""
    for name in list(sys.modules):
        if name.startswith("moody_lens_ext.") and not name.startswith("moody_lens_ext.services"):
            sys.modules.pop(name, None)
            # `from pkg import sub` prefers the parent's cached attribute, so clear that too.
            parent = sys.modules.get(name.rsplit(".", 1)[0])
            if parent is not None and hasattr(parent, name.rsplit(".", 1)[1]):
                delattr(parent, name.rsplit(".", 1)[1])


def _install_fake_host(monkeypatch, state: dict):
    """Registers fake `app.*` modules and returns a freshly imported moody_lens_ext.media."""
    def mod(name: str, **attrs):
        m = types.ModuleType(name)
        m.__dict__.update(attrs)
        monkeypatch.setitem(sys.modules, name, m)
        return m

    class _Settings:
        allow_mock = True
        def max_mb(self, _kind):  # noqa: ANN001
            return 100

    async def save_upload(upload, kind):
        data = await upload.read()
        if not data:
            raise FakeAnalysisError("empty upload", 400)
        fd, path = tempfile.mkstemp(prefix="fake-host-", suffix=".bin")
        os.write(fd, data)
        os.close(fd)
        state["saved"].append(path)
        return SimpleNamespace(path=path)

    def runner(path, analysis_id):
        # Record what the host task would receive: ONE file, and which streams it has.
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", path],
            capture_output=True, text=True,
        )
        types_ = {s["codec_type"] for s in json.loads(probe.stdout or '{"streams": []}')["streams"]}
        state["runner_calls"].append({"path": path, "streams": types_})
        res = SimpleNamespace(verdict="likely_real", fake_probability=0.2, scores=[], model_versions={"detector": "fake"})
        return SimpleNamespace(result=res)

    mod("app")
    mod("app.core")
    mod("app.core.config", settings=_Settings())
    mod("app.core.errors", AnalysisError=FakeAnalysisError, NotFound=type("NotFound", (Exception,), {}))
    mod("app.core.logging", get_logger=lambda _n: __import__("logging").getLogger("fake-host"))
    mod("app.core.storage", get_storage=lambda: None, new_upload_key=lambda *a, **k: "k")
    mod("app.core.uploads", save_upload=save_upload)
    mod("app.services")
    heartbeat = mod("app.services.heartbeat", ready_queues=lambda: state["queues"])
    mod("app.services.pipelines", RUNNERS={"video": runner, "image": runner, "audio": runner})
    mod("app.services.jobs", get_job=lambda _id: (_ for _ in ()).throw(KeyError(_id)))
    sys.modules["app"].core = sys.modules["app.core"]
    sys.modules["app"].services = sys.modules["app.services"]
    sys.modules["app.services"].heartbeat = heartbeat

    _forget_extension_modules()
    media = importlib.import_module("moody_lens_ext.media")
    monkeypatch.setattr(media, "EXTENSION_JOBS", {}, raising=True)
    return media


@pytest.fixture
def env(monkeypatch, tmp_path):
    monkeypatch.delenv("MML_BRAIN", raising=False)
    monkeypatch.setenv("MML_EXT_DATA_DIR", str(tmp_path / "ext-data"))
    state = {"saved": [], "runner_calls": [], "queues": {"inference.fast": 1, "inference.video": 1}}
    before = set(glob.glob(os.path.join(tempfile.gettempdir(), "mml-ext-*")))
    media = _install_fake_host(monkeypatch, state)
    app = FastAPI()
    app.include_router(media.router)
    yield SimpleNamespace(client=TestClient(app), state=state, media=media, before=before)
    _forget_extension_modules()


def leaked_workspaces(env) -> set[str]:
    return set(glob.glob(os.path.join(tempfile.gettempdir(), "mml-ext-*"))) - env.before


@pytest.fixture(scope="module")
def clips(tmp_path_factory) -> dict[str, bytes]:
    if not video_prep.ffmpeg_available():
        return {}
    d = tmp_path_factory.mktemp("glue-clips")
    video, audio = d / "v.mp4", d / "a.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=1", "-pix_fmt", "yuv420p", str(video)], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=duration=1", "-c:a", "aac", str(audio)], check=True)
    return {"video": video.read_bytes(), "audio": audio.read_bytes()}


def post_video(env, clips, audio: bytes | None = None, media_type: str = "video"):
    files = {"media": ("v.mp4", clips["video"], "video/mp4")}
    if audio is not None:
        files["audio"] = ("a.mp4", audio, "audio/mp4")
    return env.client.post("/api/v1/detect", files=files, data={"media_type": media_type})


@needs_ffmpeg
def test_video_plus_audio_reaches_the_host_as_one_muxed_file(env, clips):
    res = post_video(env, clips, audio=clips["audio"])
    assert res.status_code == 202
    assert len(env.state["runner_calls"]) == 1
    call = env.state["runner_calls"][0]
    assert call["streams"] == {"video", "audio"}
    job = env.client.get(f"/api/v1/jobs/{res.json()['job_id']}").json()
    assert job["status"] == "completed"
    # Temp cleanup: uploaded video, muxed file and the workspace are all gone.
    assert not any(os.path.exists(p) for p in env.state["saved"])
    assert not os.path.exists(call["path"])
    assert leaked_workspaces(env) == set()


@needs_ffmpeg
def test_silent_video_without_audio_part_still_works(env, clips):
    res = post_video(env, clips)
    assert res.status_code == 202
    assert env.state["runner_calls"][0]["streams"] == {"video"}
    assert leaked_workspaces(env) == set()


@needs_ffmpeg
def test_missing_ffmpeg_with_audio_part_is_a_clear_503_and_cleans_up(env, clips, monkeypatch):
    monkeypatch.setattr(shutil, "which", lambda _n: None)
    res = post_video(env, clips, audio=clips["audio"])
    assert res.status_code == 503
    body = res.json()
    assert body["code"] == "FFMPEG_UNAVAILABLE" and "ffmpeg" in body["error"]
    assert env.state["runner_calls"] == []
    assert not any(os.path.exists(p) for p in env.state["saved"])
    assert leaked_workspaces(env) == set()


@needs_ffmpeg
def test_audio_part_without_audio_stream_is_415(env, clips):
    res = post_video(env, clips, audio=clips["video"])
    assert res.status_code == 415
    assert leaked_workspaces(env) == set()
    assert not any(os.path.exists(p) for p in env.state["saved"])


def test_audio_part_with_non_video_media_type_is_400(env):
    res = env.client.post(
        "/api/v1/detect",
        files={"media": ("i.png", b"x", "image/png"), "audio": ("a.mp4", b"x", "audio/mp4")},
        data={"media_type": "image"},
    )
    assert res.status_code == 400 and res.json()["code"] == "VALIDATION_ERROR"


def test_health_reports_mock_flag(env):
    ok = env.client.get("/api/v1/health", headers={"X-Client": "extension"}).json()
    assert ok["mock"] is True  # fake host has allow_mock = True

    env.media.settings.allow_mock = False
    env.state["queues"] = {"inference.fast": 1}
    assert env.client.get("/api/v1/health", headers={"X-Client": "extension"}).json()["mock"] is False
    env.state["queues"] = {}
    assert env.client.get("/api/v1/health", headers={"X-Client": "extension"}).json()["mock"] is True
    # Plain liveness probe stays minimal.
    assert env.client.get("/api/v1/health").json() == {"status": "ok"}


# ── detect-url ──────────────────────────────────────────────────────────────

URL = "https://www.reddit.com/r/test/comments/abc123/slug/"


def test_detect_url_is_501_when_the_flag_is_off(env, monkeypatch):
    monkeypatch.delenv("FEATURE_DETECT_URL", raising=False)
    res = env.client.post("/api/v1/detect-url", json={"url": URL})
    assert res.status_code == 501


def test_detect_url_validates_before_downloading(env, monkeypatch):
    monkeypatch.setenv("FEATURE_DETECT_URL", "true")
    monkeypatch.setattr(url_resolver, "download_reddit_video", lambda *_a: pytest.fail("must not download"))
    for url in ("http://169.254.169.254/", "https://evil.com/r/x/comments/abc/", "https://v.redd.it/abc/DASH_480.mp4"):
        res = env.client.post("/api/v1/detect-url", json={"url": url})
        assert res.status_code == 400, url
    res = env.client.post("/api/v1/detect-url", json={"url": URL, "media_type": "image"})
    assert res.status_code == 400


def test_detect_url_blocked_maps_to_reddit_blocked(env, monkeypatch):
    monkeypatch.setenv("FEATURE_DETECT_URL", "true")

    def blocked(_url, _ws):
        raise video_prep.VideoPrepError("REDDIT_BLOCKED", "Reddit blocked server download.", 502)

    monkeypatch.setattr(url_resolver, "download_reddit_video", blocked)
    res = env.client.post("/api/v1/detect-url", json={"url": URL})
    assert res.status_code == 502
    assert res.json() == {"error": "Reddit blocked server download.", "code": "REDDIT_BLOCKED"}
    assert leaked_workspaces(env) == set()


@needs_ffmpeg
def test_detect_url_success_runs_the_pipeline_and_cleans_up(env, clips, monkeypatch):
    monkeypatch.setenv("FEATURE_DETECT_URL", "true")

    def fake_download(_url, ws):
        out = ws.path / "resolved.mp4"
        out.write_bytes(clips["video"])
        return out

    monkeypatch.setattr(url_resolver, "download_reddit_video", fake_download)
    res = env.client.post("/api/v1/detect-url", json={"url": URL})
    assert res.status_code == 202 and res.json()["job_id"].startswith("job-")
    assert len(env.state["runner_calls"]) == 1
    assert leaked_workspaces(env) == set()
