"""
tests/test_video_prep.py – ffprobe/ffmpeg helpers.

Label: RUNTIME (real ffmpeg/ffprobe) for tests using `media_files`; those skip when ffmpeg is absent.
The error-mapping tests use monkeypatching and always run (STATIC/mocked subprocess).
"""

from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from moody_lens_ext.services import video_prep
from moody_lens_ext.services.video_prep import TempWorkspace, VideoPrepError

needs_ffmpeg = pytest.mark.skipif(not video_prep.ffmpeg_available(), reason="ffmpeg/ffprobe not installed")


def _run(args: list[str]) -> None:
    subprocess.run(args, check=True, capture_output=True)


@pytest.fixture(scope="module")
def media_files(tmp_path_factory) -> dict[str, Path]:
    """Synthetic 1s clips: video-only, silent-audio-less, audio-only (mp4/aac), and a long (5s) video."""
    d = tmp_path_factory.mktemp("clips")
    video = d / "video.mp4"
    audio = d / "audio.mp4"
    long_video = d / "long.mp4"
    _run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=1", "-pix_fmt", "yuv420p", str(video)])
    _run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "aac", str(audio)])
    _run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=5", "-pix_fmt", "yuv420p", str(long_video)])
    return {"video": video, "audio": audio, "long": long_video}


def _streams(path: Path) -> set[str]:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    return {s["codec_type"] for s in json.loads(out)["streams"]}


@needs_ffmpeg
def test_probe_reports_streams_and_duration(media_files):
    v = video_prep.probe(media_files["video"])
    assert v.has_video and not v.has_audio
    assert v.duration_s == pytest.approx(1.0, abs=0.3)
    a = video_prep.probe(media_files["audio"])
    assert a.has_audio and not a.has_video


@needs_ffmpeg
def test_probe_enforces_duration_cap(media_files):
    with pytest.raises(VideoPrepError) as exc:
        video_prep.probe(media_files["long"], max_duration_s=2)
    assert exc.value.code == "VIDEO_TOO_LONG" and exc.value.status_code == 413


@needs_ffmpeg
def test_probe_rejects_unreadable_file(tmp_path):
    bad = tmp_path / "bad.mp4"
    bad.write_bytes(b"not a video")
    with pytest.raises(VideoPrepError) as exc:
        video_prep.probe(bad)
    assert exc.value.status_code == 415


@needs_ffmpeg
def test_enforce_duration_cap_only_raises_for_too_long(media_files, tmp_path):
    bad = tmp_path / "bad.mp4"
    bad.write_bytes(b"not a video")
    video_prep.enforce_duration_cap(bad)  # unreadable: left to the host's validation
    video_prep.enforce_duration_cap(media_files["video"])
    with pytest.raises(VideoPrepError) as exc:
        video_prep.enforce_duration_cap(media_files["long"], max_duration_s=2)
    assert exc.value.code == "VIDEO_TOO_LONG"


@needs_ffmpeg
def test_combine_produces_one_mp4_with_both_streams(media_files):
    ws = TempWorkspace()
    try:
        out = video_prep.combine(media_files["video"], media_files["audio"], ws)
        assert out.exists() and out.parent == ws.path
        assert _streams(out) == {"video", "audio"}
    finally:
        ws.cleanup()
    assert not ws.path.exists()


@needs_ffmpeg
def test_combine_rejects_audio_part_without_audio_stream(media_files):
    ws = TempWorkspace()
    try:
        with pytest.raises(VideoPrepError) as exc:
            video_prep.combine(media_files["video"], media_files["video"], ws)
        assert exc.value.status_code == 415
    finally:
        ws.cleanup()


def test_missing_ffmpeg_is_a_clear_503(monkeypatch, tmp_path):
    monkeypatch.setattr(shutil, "which", lambda _name: None)
    assert video_prep.ffmpeg_available() is False
    for call in (lambda: video_prep.ensure_ffmpeg(), lambda: video_prep.probe(tmp_path / "x.mp4")):
        with pytest.raises(VideoPrepError) as exc:
            call()
        assert exc.value.code == "FFMPEG_UNAVAILABLE" and exc.value.status_code == 503
        assert "ffmpeg" in exc.value.message


def test_timeout_maps_to_504(monkeypatch):
    monkeypatch.setattr(shutil, "which", lambda name: f"/usr/bin/{name}")

    def boom(*_a, **_k):
        raise subprocess.TimeoutExpired(cmd="ffprobe", timeout=1)

    monkeypatch.setattr(subprocess, "run", boom)
    with pytest.raises(VideoPrepError) as exc:
        video_prep.probe("whatever.mp4")
    assert exc.value.code == "PROCESSING_TIMEOUT" and exc.value.status_code == 504


def test_subprocess_calls_never_use_a_shell(monkeypatch):
    monkeypatch.setattr(shutil, "which", lambda name: f"/usr/bin/{name}")
    seen = {}

    def fake_run(args, **kwargs):
        seen.update(kwargs, args=args)
        return subprocess.CompletedProcess(args, 1, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(VideoPrepError):
        video_prep.probe("a.mp4")
    assert isinstance(seen["args"], list) and not seen.get("shell") and seen["timeout"] > 0


class _FakeUpload:
    def __init__(self, data: bytes):
        self._data = data

    async def read(self, n: int) -> bytes:
        chunk, self._data = self._data[:n], self._data[n:]
        return chunk


def test_save_audio_part_writes_inside_workspace_and_caps_size():
    ws = TempWorkspace()
    try:
        path = asyncio.run(video_prep.save_audio_part(_FakeUpload(b"x" * 100), ws))
        assert path.parent == ws.path and path.read_bytes() == b"x" * 100
        with pytest.raises(VideoPrepError) as big:
            asyncio.run(video_prep.save_audio_part(_FakeUpload(b"x" * 100), ws, max_bytes=10))
        assert big.value.status_code == 413
        with pytest.raises(VideoPrepError) as empty:
            asyncio.run(video_prep.save_audio_part(_FakeUpload(b""), ws))
        assert empty.value.status_code == 400
    finally:
        ws.cleanup()


def test_temp_workspace_cleanup_is_idempotent():
    ws = TempWorkspace()
    (ws.path / "f").write_text("x")
    ws.cleanup()
    ws.cleanup()
    assert not ws.path.exists()
