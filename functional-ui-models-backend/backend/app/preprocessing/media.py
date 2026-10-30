"""ffmpeg / ffprobe helpers.

Both binaries run as subprocesses with hard timeouts and no shell, so a
hostile file can at worst burn the timeout, never inject a command.
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass

FFPROBE_TIMEOUT_S = 15
FFMPEG_TIMEOUT_S = 60


@dataclass(frozen=True)
class ProbeResult:
    duration_s: float | None
    has_video: bool
    has_audio: bool
    width: int | None
    height: int | None


def probe(path: str) -> ProbeResult | None:
    """Inspect a media container with ffprobe; None if it is not readable media."""
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        path,
    ]
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=FFPROBE_TIMEOUT_S, check=False)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None
    if out.returncode != 0:
        return None
    try:
        info = json.loads(out.stdout or b"{}")
    except json.JSONDecodeError:
        return None
    streams = info.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    duration = info.get("format", {}).get("duration")
    return ProbeResult(
        duration_s=float(duration) if duration not in (None, "N/A") else None,
        has_video=video is not None,
        has_audio=audio is not None,
        width=int(video["width"]) if video and video.get("width") else None,
        height=int(video["height"]) if video and video.get("height") else None,
    )


def extract_audio(video_path: str, out_wav: str) -> bool:
    """Write a 16 kHz mono WAV of the video's audio track. False if there is none."""
    cmd = [
        "ffmpeg",
        "-y",
        "-loglevel",
        "error",
        "-i",
        video_path,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        out_wav,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=FFMPEG_TIMEOUT_S, check=False)
    except subprocess.TimeoutExpired:
        return False
    return result.returncode == 0 and os.path.exists(out_wav) and os.path.getsize(out_wav) > 1000
