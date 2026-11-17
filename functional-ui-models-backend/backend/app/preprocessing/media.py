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


def is_silent(wav_path: str, threshold_dbfs: float) -> bool:
    """True when the WAV's peak level is below ``threshold_dbfs`` (digital silence).

    A muted soundtrack is not speech: scoring it with the synthetic-speech model gives a
    meaningless probability that can flip a video's max-aggregated verdict. Streamed in
    blocks so a 10-minute track never sits in memory at once.
    """
    import numpy as np  # noqa: PLC0415 – worker-only (the API imports this module for probe())
    import soundfile as sf  # noqa: PLC0415

    limit = 10 ** (threshold_dbfs / 20)
    for block in sf.blocks(wav_path, blocksize=65_536, dtype="float32", always_2d=True):
        if block.size and float(np.max(np.abs(block))) >= limit:
            return False
    return True


def extract_audio(video_path: str, out_wav: str, silence_dbfs: float | None = None) -> bool:
    """Write a 16 kHz mono WAV of the video's audio track.

    False if there is none, or (when ``silence_dbfs`` is given) if it is digital silence.
    """
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
    if not (result.returncode == 0 and os.path.exists(out_wav) and os.path.getsize(out_wav) > 1000):
        return False
    return silence_dbfs is None or not is_silent(out_wav, silence_dbfs)
