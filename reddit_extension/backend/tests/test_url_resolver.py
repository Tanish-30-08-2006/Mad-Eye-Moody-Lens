"""
tests/test_url_resolver.py – Tier-2 resolver safety checks.

Label: STATIC/mocked for everything here: SSRF validation is pure, and yt-dlp is never actually run
(subprocess is monkeypatched), so nothing touches the network.
"""

from __future__ import annotations

import subprocess
import sys

import pytest

from moody_lens_ext.services import url_resolver
from moody_lens_ext.services.video_prep import TempWorkspace, VideoPrepError

GOOD = [
    "https://www.reddit.com/r/test/comments/abc123/some_title/",
    "https://reddit.com/r/test/comments/abc123/",
    "https://old.reddit.com/r/Test_Sub/comments/abc123/slug",
    "https://www.reddit.com/r/test/comments/abc123",
]

BAD = [
    "http://www.reddit.com/r/test/comments/abc123/",            # not https
    "https://www.reddit.com.evil.com/r/test/comments/abc123/",   # lookalike host
    "https://evil.com/www.reddit.com/r/test/comments/abc123/",   # host in path
    "https://user:pw@www.reddit.com/r/test/comments/abc123/",    # credentials
    "https://www.reddit.com:8443/r/test/comments/abc123/",       # odd port
    "https://www.reddit.com@evil.com/r/test/comments/abc123/",   # userinfo trick
    "https://v.redd.it/abc123/DASH_480.mp4",                      # media host, not a permalink
    "https://www.reddit.com/user/someone/",                       # not a post
    "https://www.reddit.com/r/test/comments/abc123/x/../../../etc/passwd",
    "file:///etc/passwd",
    "ftp://www.reddit.com/r/test/comments/abc123/",
    "http://169.254.169.254/latest/meta-data/",
    "http://localhost:8000/r/test/comments/abc123/",
    "",
    "not a url",
]


@pytest.mark.parametrize("url", GOOD)
def test_accepts_reddit_permalinks(url):
    assert url_resolver.is_reddit_permalink(url)


@pytest.mark.parametrize("url", BAD)
def test_rejects_everything_else(url):
    assert not url_resolver.is_reddit_permalink(url)


def test_download_refuses_non_reddit_urls_before_running_anything(monkeypatch):
    def forbidden(*_a, **_k):
        raise AssertionError("subprocess must not run for an invalid URL")

    monkeypatch.setattr(subprocess, "run", forbidden)
    ws = TempWorkspace()
    try:
        with pytest.raises(VideoPrepError) as exc:
            url_resolver.download_reddit_video("http://169.254.169.254/", ws)
        assert exc.value.status_code == 400
    finally:
        ws.cleanup()


def test_feature_flag_defaults_off_and_follows_env(monkeypatch):
    monkeypatch.delenv("FEATURE_DETECT_URL", raising=False)
    assert url_resolver.feature_enabled() is False
    monkeypatch.setenv("FEATURE_DETECT_URL", "true")
    assert url_resolver.feature_enabled() is True
    monkeypatch.setenv("FEATURE_DETECT_URL", "0")
    assert url_resolver.feature_enabled() is False


def _patch_run(monkeypatch, returncode=0, stderr="", create_file=None, raises=None):
    monkeypatch.setattr(url_resolver, "ytdlp_available", lambda: True)

    def fake_run(args, **kwargs):
        assert isinstance(args, list) and args[0] == sys.executable and "shell" not in kwargs
        assert kwargs["timeout"] == url_resolver.RESOLVE_TIMEOUT_S
        assert args[-2:] == ["--", "https://www.reddit.com/r/test/comments/abc123/"]
        if raises:
            raise raises
        if create_file:
            create_file()
        return subprocess.CompletedProcess(args, returncode, stdout="", stderr=stderr)

    monkeypatch.setattr(subprocess, "run", fake_run)


URL = "https://www.reddit.com/r/test/comments/abc123/"


def test_blocked_download_maps_to_reddit_blocked(monkeypatch):
    _patch_run(monkeypatch, returncode=1, stderr="ERROR: unable to download: HTTP Error 403: Blocked")
    ws = TempWorkspace()
    try:
        with pytest.raises(VideoPrepError) as exc:
            url_resolver.download_reddit_video(URL, ws)
        assert exc.value.code == "REDDIT_BLOCKED"
        assert exc.value.message == "Reddit blocked server download."
        assert exc.value.status_code == 502
    finally:
        ws.cleanup()


def test_other_failures_and_timeouts(monkeypatch):
    ws = TempWorkspace()
    try:
        _patch_run(monkeypatch, returncode=1, stderr="ERROR: something else")
        with pytest.raises(VideoPrepError) as other:
            url_resolver.download_reddit_video(URL, ws)
        assert other.value.code == "DOWNLOAD_FAILED"

        _patch_run(monkeypatch, raises=subprocess.TimeoutExpired(cmd="yt-dlp", timeout=1))
        with pytest.raises(VideoPrepError) as slow:
            url_resolver.download_reddit_video(URL, ws)
        assert slow.value.code == "PROCESSING_TIMEOUT"
    finally:
        ws.cleanup()


def test_silent_skip_by_caps_is_reported_as_too_long(monkeypatch):
    _patch_run(monkeypatch, returncode=0)
    ws = TempWorkspace()
    try:
        with pytest.raises(VideoPrepError) as exc:
            url_resolver.download_reddit_video(URL, ws)
        assert exc.value.code == "VIDEO_TOO_LONG"
    finally:
        ws.cleanup()


def test_success_returns_the_downloaded_file(monkeypatch):
    ws = TempWorkspace()
    _patch_run(monkeypatch, create_file=lambda: (ws.path / "resolved.mp4").write_bytes(b"x"))
    try:
        assert url_resolver.download_reddit_video(URL, ws).name == "resolved.mp4"
    finally:
        ws.cleanup()


def test_missing_ytdlp_is_a_clear_503(monkeypatch):
    monkeypatch.setattr(url_resolver, "ytdlp_available", lambda: False)
    ws = TempWorkspace()
    try:
        with pytest.raises(VideoPrepError) as exc:
            url_resolver.download_reddit_video(URL, ws)
        assert exc.value.status_code == 503
    finally:
        ws.cleanup()


def test_ytdlp_is_not_imported_at_module_load():
    assert "yt_dlp" not in sys.modules
