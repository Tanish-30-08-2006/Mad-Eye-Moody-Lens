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


def test_load_settings_supports_env_aliases_and_port(monkeypatch):
    from mml_bot.config import load_settings

    for k in ("TELEGRAM_BOT_TOKEN", "BOT_TOKEN", "MML_API_BASE_URL", "BACKEND_URL", "MODEL_MODE", "PORT"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("BOT_TOKEN", "123:abc")
    monkeypatch.setenv("BACKEND_URL", "https://example.onrender.com/")
    monkeypatch.setenv("PORT", "10000")

    s = load_settings()
    assert s.token == "123:abc"
    assert s.api_base_url == "https://example.onrender.com/api/v1"
    assert s.model_mode == "real"
    assert s.port == 10000

    monkeypatch.setenv("MODEL_MODE", "stub")
    assert load_settings().model_mode == "stub"

    monkeypatch.setenv("MODEL_MODE", "invalid_mode")
    with pytest.raises(SystemExit):
        load_settings()


def test_lightweight_scorer_produces_input_dependent_image_and_audio_scores():
    import io
    import wave

    import numpy as np
    from PIL import Image, PngImagePlugin

    from mml_bot.scorer import LightweightForensicScorer

    scorer = LightweightForensicScorer()
    rng = np.random.default_rng(42)

    # 1. Natural camera-like photo: broadband texture + sensor noise + camera EXIF tags.
    yy, xx = np.mgrid[0:128, 0:128]
    base = 120.0 + 40.0 * np.sin(xx / 11.0) * np.cos(yy / 13.0)
    natural_rgb = np.clip(
        np.stack([base, base * 0.95, base * 0.9], axis=-1) + rng.normal(0.0, 9.0, (128, 128, 3)),
        0,
        255,
    ).astype(np.uint8)
    nat_buf = io.BytesIO()
    exif = Image.Exif()
    exif[271] = "Canon"
    exif[272] = "EOS R6"
    exif[33434] = (1, 125)
    Image.fromarray(natural_rgb).save(nat_buf, format="JPEG", quality=92, exif=exif)

    # 2. Synthetic AI-marked smooth image with periodic grid artifact.
    grid = 128.0 + 30.0 * ((xx % 4 == 0) & (yy % 4 == 0)).astype(np.float32)
    synth_rgb = np.clip(np.stack([grid, grid, grid], axis=-1), 0, 255).astype(np.uint8)
    syn_buf = io.BytesIO()
    meta = PngImagePlugin.PngInfo()
    meta.add_text("Software", "Stable Diffusion Automatic1111")
    Image.fromarray(synth_rgb).save(syn_buf, format="PNG", pnginfo=meta)

    res_real = scorer.analyze_image_sync(nat_buf.getvalue())
    res_synth = scorer.analyze_image_sync(syn_buf.getvalue())

    assert res_real["fake_probability"] != res_synth["fake_probability"]
    assert res_real["fake_probability"] < res_synth["fake_probability"]
    assert res_synth["verdict"] == "likely_fake"
    assert res_real["verdict"] in {"likely_real", "uncertain"}
    assert "Likely" in format_result(res_real) or "Uncertain" in format_result(res_real)
    assert "Likely AI-generated" in format_result(res_synth)

    # Invalid bytes must raise ApiError, never silently fall back to stub.
    with pytest.raises(ApiError):
        scorer.analyze_image_sync(b"not an image")

    # 3. Audio: natural noisy waveform vs pure synthetic digital-silence tone.
    sr = 16000
    t = np.linspace(0, 2.0, sr * 2, endpoint=False)
    natural_wav = np.clip(
        0.15 * np.sin(2 * np.pi * 240 * t) + 0.06 * np.sin(2 * np.pi * 1700 * t) + rng.normal(0.0, 0.025, t.size),
        -1.0,
        1.0,
    )
    synth_wav = np.zeros_like(t)
    synth_wav[sr // 2 : sr] = 0.25 * np.sin(2 * np.pi * 220 * t[sr // 2 : sr])

    def to_wav(samples: np.ndarray) -> bytes:
        out = io.BytesIO()
        with wave.open(out, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sr)
            wf.writeframes((samples * 32767.0).astype(np.int16).tobytes())
        return out.getvalue()

    a_real = scorer.analyze_audio_sync(to_wav(natural_wav))
    a_synth = scorer.analyze_audio_sync(to_wav(synth_wav))
    assert a_real["fake_probability"] != a_synth["fake_probability"]
    assert a_real["segments"] and a_synth["segments"]
