"""
url_resolver.py – Tier-2 fallback: download a Reddit post's video server-side with yt-dlp.

Disabled unless FEATURE_DETECT_URL is true. Reddit often blocks datacenter IPs (HTTP 403), so
this is a best-effort fallback after the extension's own browser-session fetch.

Safety:
- Only https reddit.com permalinks are accepted (SSRF guard): no other host, port, userinfo or scheme.
- yt-dlp runs as `python -m yt_dlp` in a subprocess with a hard timeout, size and duration caps,
  and a private temp directory that the caller must clean up.
- yt-dlp is never imported at module load; presence is checked with importlib.
No host (`app.*`) imports.
"""

from __future__ import annotations

import importlib.util
import logging
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

from .video_prep import MAX_VIDEO_SECONDS, TempWorkspace, VideoPrepError

logger = logging.getLogger(__name__)

RESOLVE_TIMEOUT_S = 90
MAX_DOWNLOAD_MB = int(os.getenv("MOODY_LENS_MAX_DOWNLOAD_MB", "50"))

_ALLOWED_HOSTS = {"www.reddit.com", "reddit.com", "old.reddit.com", "sh.reddit.com", "np.reddit.com"}
_PERMALINK_PATH = re.compile(r"^/r/[A-Za-z0-9_]+/comments/[A-Za-z0-9]+(?:/[^/?#]*)?/?$")
_BLOCKED_HINTS = ("403", "blocked", "forbidden", "http error 429", "too many requests")


def feature_enabled() -> bool:
    """FEATURE_DETECT_URL env flag (default off); the host settings object wins if it defines it."""
    try:
        from app.core.config import settings  # type: ignore  # host import, guarded

        flag = getattr(settings, "feature_detect_url", None)
        if flag is not None:
            return bool(flag)
    except Exception:  # noqa: BLE001 - host not importable (tests, standalone): fall back to env
        pass
    return os.getenv("FEATURE_DETECT_URL", "false").strip().lower() in ("1", "true", "yes", "on")


def is_reddit_permalink(url: str) -> bool:
    """True only for https://<reddit host>/r/<sub>/comments/<id>[/slug] with no port or credentials."""
    try:
        parts = urlsplit(url.strip())
        if parts.scheme != "https" or parts.username or parts.password:
            return False
        if parts.hostname not in _ALLOWED_HOSTS:
            return False
        if parts.port not in (None, 443):
            return False
        return bool(_PERMALINK_PATH.match(parts.path))
    except ValueError:
        return False


def ytdlp_available() -> bool:
    return importlib.util.find_spec("yt_dlp") is not None


def download_reddit_video(url: str, workspace: TempWorkspace) -> Path:
    """Downloads the post's video (<=480p, capped size/duration) into the workspace; returns the file path."""
    if not is_reddit_permalink(url):
        raise VideoPrepError("VALIDATION_ERROR", "Only reddit.com post links can be resolved.", 400)
    if not ytdlp_available():
        raise VideoPrepError("RESOLVER_UNAVAILABLE", "yt-dlp is not installed on the server.", 503)

    out_template = str(workspace.path / "resolved.%(ext)s")
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--no-playlist", "--no-warnings", "--no-progress", "--ignore-config",
        "--max-filesize", f"{MAX_DOWNLOAD_MB}M",
        "--match-filter", f"duration<={MAX_VIDEO_SECONDS}",
        "--socket-timeout", "20", "--retries", "1",
        "-f", "bv*[height<=480]+ba/b[height<=480]/b",
        "--merge-output-format", "mp4",
        "-o", out_template,
        "--", url,
    ]
    try:
        proc = subprocess.run(  # noqa: S603 - fixed argv, validated URL, no shell
            cmd, capture_output=True, text=True, timeout=RESOLVE_TIMEOUT_S, check=False, stdin=subprocess.DEVNULL
        )
    except subprocess.TimeoutExpired as exc:
        raise VideoPrepError("PROCESSING_TIMEOUT", "Downloading the video took too long.", 504) from exc

    stderr = (proc.stderr or "").lower()
    if proc.returncode != 0:
        logger.warning("yt-dlp failed (rc=%s)", proc.returncode)
        if any(hint in stderr for hint in _BLOCKED_HINTS):
            raise VideoPrepError("REDDIT_BLOCKED", "Reddit blocked server download.", 502)
        raise VideoPrepError("DOWNLOAD_FAILED", "The video could not be downloaded.", 502)

    files = sorted(workspace.path.glob("resolved.*"))
    if not files:
        # --match-filter / --max-filesize skip silently with rc=0.
        raise VideoPrepError("VIDEO_TOO_LONG", "The video is too long or too large to download.", 413)
    return files[0]
