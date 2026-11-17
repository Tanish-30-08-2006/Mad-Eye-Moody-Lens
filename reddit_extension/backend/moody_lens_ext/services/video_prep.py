"""
video_prep.py – ffprobe/ffmpeg helpers for Reddit videos that arrive as separate video and audio files.

Reddit serves video-only MP4s plus a separate audio file. The host's video task expects ONE
file, so we probe both (duration cap, audio present) and stream-copy them into a single MP4.
Pure stdlib: no host (`app.*`) or FastAPI imports, so it is testable on its own.

Every subprocess call uses an argument list (never a shell) and a timeout; temp files live in
a TempWorkspace that is always cleaned up by the caller.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Longest video we will analyse (seconds) and largest separate audio part we will accept (bytes).
MAX_VIDEO_SECONDS = int(os.getenv("MOODY_LENS_MAX_VIDEO_SECONDS", "180"))
MAX_AUDIO_BYTES = int(os.getenv("MOODY_LENS_MAX_AUDIO_MB", "50")) * 1024 * 1024

PROBE_TIMEOUT_S = 20
MUX_TIMEOUT_S = 120
_CHUNK = 1024 * 1024


class VideoPrepError(Exception):
    """A failure the API should report to the client as `status_code` with a stable `code`."""

    def __init__(self, code: str, message: str, status_code: int) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class ProbeResult:
    duration_s: Optional[float]
    has_video: bool
    has_audio: bool


class TempWorkspace:
    """A private temp directory removed by cleanup(); safe to call more than once."""

    def __init__(self) -> None:
        self.path = Path(tempfile.mkdtemp(prefix="mml-ext-"))

    def cleanup(self) -> None:
        shutil.rmtree(self.path, ignore_errors=True)


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def ensure_ffmpeg() -> None:
    if not ffmpeg_available():
        raise VideoPrepError(
            "FFMPEG_UNAVAILABLE",
            "ffmpeg is not installed on the server, so this video cannot be processed.",
            503,
        )


def _run(args: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    """Runs a tool without a shell; maps missing binary and timeouts to VideoPrepError."""
    try:
        return subprocess.run(  # noqa: S603 - fixed argv, no shell
            args, capture_output=True, text=True, timeout=timeout, check=False, stdin=subprocess.DEVNULL
        )
    except FileNotFoundError as exc:
        raise VideoPrepError("FFMPEG_UNAVAILABLE", "ffmpeg is not installed on the server.", 503) from exc
    except subprocess.TimeoutExpired as exc:
        raise VideoPrepError("PROCESSING_TIMEOUT", "Processing the video took too long.", 504) from exc


def probe(path: str | Path, max_duration_s: float = MAX_VIDEO_SECONDS) -> ProbeResult:
    """Reads stream info and enforces the duration cap. Raises VideoPrepError on bad or too-long media."""
    ensure_ffmpeg()
    proc = _run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        PROBE_TIMEOUT_S,
    )
    if proc.returncode != 0:
        raise VideoPrepError("UNSUPPORTED_MEDIA_TYPE", "The media file could not be read.", 415)

    try:
        info: dict[str, Any] = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise VideoPrepError("UNSUPPORTED_MEDIA_TYPE", "The media file could not be read.", 415) from exc

    streams = info.get("streams") or []
    has_video = any(s.get("codec_type") == "video" for s in streams)
    has_audio = any(s.get("codec_type") == "audio" for s in streams)

    duration: Optional[float] = None
    try:
        duration = float((info.get("format") or {}).get("duration"))
    except (TypeError, ValueError):
        duration = None

    if duration is not None and duration > max_duration_s:
        raise VideoPrepError(
            "VIDEO_TOO_LONG",
            f"Video is {duration:.0f}s long; the limit is {max_duration_s:.0f}s.",
            413,
        )
    return ProbeResult(duration_s=duration, has_video=has_video, has_audio=has_audio)


def enforce_duration_cap(path: str | Path, max_duration_s: float = MAX_VIDEO_SECONDS) -> None:
    """Rejects videos over the cap. Unreadable files are left for the host's own validation to judge."""
    try:
        probe(path, max_duration_s)
    except VideoPrepError as exc:
        if exc.code == "VIDEO_TOO_LONG":
            raise
        logger.debug("Duration check skipped (%s)", exc.code)


async def save_audio_part(upload: Any, workspace: TempWorkspace, max_bytes: int = MAX_AUDIO_BYTES) -> Path:
    """Streams an uploaded audio part (anything with `await read(n)`) into the workspace, capped in size."""
    dest = workspace.path / "audio_part"
    written = 0
    with dest.open("wb") as fh:
        while True:
            chunk = await upload.read(_CHUNK)
            if not chunk:
                break
            written += len(chunk)
            if written > max_bytes:
                raise VideoPrepError(
                    "FILE_TOO_LARGE", f"Audio part is larger than {max_bytes // (1024 * 1024)} MB.", 413
                )
            fh.write(chunk)
    if written == 0:
        raise VideoPrepError("VALIDATION_ERROR", "The audio part is empty.", 400)
    return dest


def mux(video_path: str | Path, audio_path: str | Path, out_path: str | Path) -> Path:
    """Stream-copies the video's first video stream and the audio's first audio stream into one MP4."""
    ensure_ffmpeg()
    proc = _run(
        [
            "ffmpeg", "-nostdin", "-y", "-v", "error",
            "-i", str(video_path),
            "-i", str(audio_path),
            "-map", "0:v:0", "-map", "1:a:0",
            "-c", "copy", "-shortest", "-movflags", "+faststart",
            str(out_path),
        ],
        MUX_TIMEOUT_S,
    )
    if proc.returncode != 0 or not Path(out_path).exists():
        logger.warning("ffmpeg mux failed (rc=%s): %s", proc.returncode, (proc.stderr or "")[-300:])
        raise VideoPrepError("UNSUPPORTED_MEDIA_TYPE", "The video and audio could not be combined.", 415)
    return Path(out_path)


def combine(video_path: str | Path, audio_path: str | Path, workspace: TempWorkspace) -> Path:
    """Probes both inputs, then muxes them into workspace/combined.mp4. Returns the new path."""
    video = probe(video_path)
    if not video.has_video:
        raise VideoPrepError("UNSUPPORTED_MEDIA_TYPE", "The uploaded media has no video stream.", 415)
    audio = probe(audio_path)
    if not audio.has_audio:
        raise VideoPrepError("UNSUPPORTED_MEDIA_TYPE", "The audio part has no audio stream.", 415)
    return mux(video_path, audio_path, workspace.path / "combined.mp4")
