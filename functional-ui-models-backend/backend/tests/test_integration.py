"""Host-side behaviour added for the integrated system (Reddit router, extensions, silent audio).

The Reddit extension's own suite (reddit_extension/backend/tests) covers its endpoints;
these tests pin what the host itself promises, with or without that package on the path.
"""

from __future__ import annotations

import os
import shutil
import subprocess

import numpy as np
import pytest
import soundfile as sf
from fastapi import APIRouter

from app.core.config import settings
from app.main import _merge_routers
from app.preprocessing.media import is_silent


def test_merge_routers_first_source_owns_a_shared_operation():
    first, second = APIRouter(prefix="/api/v1"), APIRouter(prefix="/api/v1")

    @first.get("/jobs/{job_id}")
    def ext_job(job_id: str) -> dict:
        return {"owner": "extension"}

    @second.get("/jobs/{job_id}")
    def native_job(job_id: str) -> dict:
        return {"owner": "native"}

    @second.delete("/jobs/{job_id}")
    def native_cancel(job_id: str) -> None:
        return None

    merged = _merge_routers([first, second])
    ops = [(r.path, sorted(r.methods), r.endpoint.__name__) for r in merged.routes]
    assert ops == [
        ("/api/v1/jobs/{job_id}", ["GET"], "ext_job"),
        ("/api/v1/jobs/{job_id}", ["DELETE"], "native_cancel"),
    ]


def test_each_operation_is_documented_once(client):
    """With or without the Reddit router, OpenAPI never lists a path+method twice."""
    app = client.app
    seen: set[tuple[str, str]] = set()
    for route in app.routes:
        for method in getattr(route, "methods", None) or ():
            key = (getattr(route, "path", ""), method)
            assert key not in seen, key
            seen.add(key)
    paths = app.openapi()["paths"]
    assert "get" in paths["/api/v1/health"] and "delete" in paths["/api/v1/jobs/{job_id}"]
    # The web contract is unchanged for clients that do not identify as the extension.
    assert client.get("/api/v1/health").json() == {"status": "ok"}


def test_extension_origin_gets_cors_but_websites_do_not(client):
    ext = "chrome-extension://" + "a" * 32
    pre = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Content-Type, X-Client"}
    ok = client.options("/api/v1/analyze/image", headers={"Origin": ext, **pre})
    assert ok.status_code == 200 and ok.headers["access-control-allow-origin"] == ext

    site = client.options("/api/v1/analyze/image", headers={"Origin": "https://evil.example", **pre})
    assert "access-control-allow-origin" not in site.headers


def test_is_silent_threshold(tmp_path):
    quiet, tone = tmp_path / "q.wav", tmp_path / "t.wav"
    sf.write(quiet, np.zeros(16000, dtype="float32"), 16000)
    t = np.linspace(0, 1, 16000, endpoint=False)
    sf.write(tone, (0.05 * np.sin(2 * np.pi * 220 * t)).astype("float32"), 16000)
    assert is_silent(str(quiet), settings.video_silence_dbfs) is True
    assert is_silent(str(tone), settings.video_silence_dbfs) is False


def _mp4(tmp_path, audio: str | None) -> bytes:
    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg not installed")
    out = os.path.join(tmp_path, "clip.mp4")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=2:size=160x120:rate=12"]
    if audio:
        cmd += ["-f", "lavfi", "-i", audio, "-shortest", "-c:a", "aac"]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", out]
    subprocess.run(cmd, check=True)
    with open(out, "rb") as fh:
        return fh.read()


@pytest.mark.parametrize(
    ("audio", "expect_audio"),
    [(None, False), ("anullsrc=r=16000:cl=mono", False), ("sine=frequency=440:duration=2", True)],
)
def test_video_audio_check_skips_missing_and_silent_tracks(client, tmp_path, audio, expect_audio):
    data = _mp4(tmp_path, audio)
    job = client.post("/api/v1/analyze/video", files={"file": ("v.mp4", data, "video/mp4")}).json()
    res = client.get(f"/api/v1/jobs/{job['job_id']}").json()["result"]
    tasks = {s["task"] for s in res["scores"]}
    assert ("synthetic_speech" in tasks) is expect_audio
    # Contract: key absent = no usable audio track; True = it was scored.
    assert res["details"].get("audio_checked") is (True if expect_audio else None)
