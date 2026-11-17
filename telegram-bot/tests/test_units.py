"""Unit tests: API error mapping, formatting, throttling and media routing (no network)."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import httpx
import pytest

from mml_bot.client import ApiError, MoodyLensClient
from mml_bot.format import format_progress, format_result, gauge
from mml_bot.limits import UserLimiter


def _client(handler) -> MoodyLensClient:
    return MoodyLensClient("http://api.test/api/v1", "k", transport=httpx.MockTransport(handler))


def test_api_error_message_is_passed_through_verbatim():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-api-key"] == "k"
        assert b'filename="upload.img"' in request.content  # never the user's file name
        return httpx.Response(429, json={"error": "Too many requests."}, headers={"Retry-After": "12"})

    async def run() -> ApiError:
        with pytest.raises(ApiError) as info:
            await _client(handler).analyze("image", b"\x89PNG....")
        return info.value

    err = asyncio.run(run())
    assert (err.message, err.status, err.retry_after) == ("Too many requests.", 429, 12)


def test_unreachable_api_is_a_plain_message():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    async def run() -> None:
        await _client(handler).analyze("audio", b"x")

    with pytest.raises(ApiError, match="unreachable"):
        asyncio.run(run())


def test_video_timeout_cancels_the_job():
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.method)
        if request.method == "DELETE":
            return httpx.Response(204)
        return httpx.Response(200, json={"job_id": "j", "status": "running", "progress": 0.5, "stage": "frames"})

    async def run() -> None:
        await _client(handler).wait_for_video("j", timeout_s=0, poll_s=0)

    with pytest.raises(ApiError, match="cancelled"):
        asyncio.run(run())
    assert calls == ["GET", "DELETE"]


RESULT = {
    "media_type": "video",
    "verdict": "likely_fake",
    "fake_probability": 0.8,
    "scores": [{"model": "<b>m</b>", "task": "face_manipulation", "fake_probability": 0.8}],
    "segments": [],
    "details": {"frames_sampled": 24, "frames_with_face": 20, "fraction_flagged": 0.5},
    "disclaimer": "Estimate & not proof.",
}


def test_format_result_escapes_and_reports_missing_audio():
    text = format_result(RESULT)
    assert "Likely AI-generated" in text and "80%" in text
    assert "&lt;b&gt;m&lt;/b&gt;" in text and "Estimate &amp; not proof." in text
    assert "20/24" in text and "none (or silent)" in text


def test_format_progress_and_gauge():
    assert "50%" in format_progress({"status": "running", "stage": "frames", "progress": 0.5})
    assert "soundtrack" in format_progress({"status": "running", "stage": "audio", "progress": 1.0})
    assert gauge(0.34) == "🟥🟥🟥⬜⬜⬜⬜⬜⬜⬜"


def test_limiter_window_and_one_video_per_user():
    lim = UserLimiter(per_window=2, window_s=60)
    assert lim.allow(1, now=0) and lim.allow(1, now=1) and not lim.allow(1, now=2)
    assert lim.allow(2, now=2)  # other users are unaffected
    assert lim.allow(1, now=61)  # the window slides
    assert lim.begin_video(1) and not lim.begin_video(1)
    lim.end_video(1)
    assert lim.begin_video(1)
    lim.prune(now=500)
    assert not lim._hits


def test_pick_media_routes_by_attachment_type():
    from mml_bot.bot import pick_media

    def msg(**kw):
        base = dict(photo=(), voice=None, audio=None, video=None, video_note=None, animation=None, document=None)
        return SimpleNamespace(**{**base, **kw})

    assert pick_media(msg(photo=("small", "large"))) == ("image", "large")
    assert pick_media(msg(voice="v"))[0] == "audio"
    doc = SimpleNamespace(mime_type="video/webm")
    assert pick_media(msg(document=doc)) == ("video", doc)
    assert pick_media(msg(document=SimpleNamespace(mime_type="application/pdf"))) is None
