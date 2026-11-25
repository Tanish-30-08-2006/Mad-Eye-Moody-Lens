"""Unit tests: API error mapping, formatting, throttling and media routing (no network)."""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from types import SimpleNamespace

import httpx
import pytest
from telegram import Update
from telegram.request import HTTPXRequest

from mml_bot.bot import build_application, pick_media
from mml_bot.client import ApiError, MoodyLensClient
from mml_bot.config import BotSettings
from mml_bot.format import format_progress, format_result, gauge
from mml_bot.limits import UserLimiter
from mml_bot.reports import REPORT_FILENAME, report_analysis_id, report_button_data, scan_report_json


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
    def msg(**kw):
        base = dict(photo=(), voice=None, audio=None, video=None, video_note=None, animation=None, document=None)
        return SimpleNamespace(**{**base, **kw})

    assert pick_media(msg(photo=("small", "large"))) == ("image", "large")
    assert pick_media(msg(voice="v"))[0] == "audio"
    doc = SimpleNamespace(mime_type="video/webm")
    assert pick_media(msg(document=doc)) == ("video", doc)
    assert pick_media(msg(document=SimpleNamespace(mime_type="application/pdf"))) is None


ANALYSIS_ID = "12345678123456781234567812345678"
BOT = {"id": 123, "is_bot": True, "first_name": "Fixture bot", "username": "fixture_bot"}
SENDER = {"id": 456, "is_bot": False, "first_name": "Fixture sender"}
DIRECT = {"id": SENDER["id"], "type": "private"}
GROUP = {"id": -602, "type": "group", "title": "Fixture group"}
FILE = {"file_id": "fixture-media", "file_unique_id": "fixture-id", "file_size": 13}
SETTINGS = BotSettings(token="123:fixture-token")


def test_report_button_is_bound_to_sender_chat_result_and_token():
    scope = {"token": SETTINGS.token, "chat_id": DIRECT["id"], "user_id": SENDER["id"]}
    data = report_button_data(ANALYSIS_ID, **scope)
    assert len(data.encode("ascii")) == 64
    assert report_analysis_id(data, **scope) == ANALYSIS_ID
    assert report_analysis_id(data, **{**scope, "chat_id": GROUP["id"]}) is None
    assert report_analysis_id(data, **{**scope, "user_id": 999}) is None
    assert report_analysis_id(data, **{**scope, "token": "different-token"}) is None
    assert report_analysis_id(data.replace(ANALYSIS_ID, "a" * 32), **scope) is None
    assert report_analysis_id(data + "0", **scope) is None
    assert report_button_data("../private", **scope) is None
    assert report_button_data(None, **scope) is None


def test_report_preserves_video_evidence_and_uses_an_allowlist():
    result = {
        **RESULT,
        "analysis_id": ANALYSIS_ID,
        "url": "https://example.test/private",
        "filename": "original-filename.mp4",
        "processing_ms": 0,
        "segments": [{"start": 0, "end": 1.25, "fake_probability": 0.8, "payload": "private-raw-data"}],
        "details": {**RESULT["details"], "audio_checked": False, "api_key": "private-token"},
    }
    report = scan_report_json(result)
    assert json.loads(report) == {
        "schema_version": 1,
        "media_type": "video",
        "verdict": "likely_fake",
        "fake_probability": 0.8,
        "processing_ms": 0,
        "scores": [{"task": "face_manipulation", "fake_probability": 0.8}],
        "segment_type": "video_segment",
        "segments": [{"start_s": 0, "end_s": 1.25, "fake_probability": 0.8}],
        "coverage": {"frames_sampled": 24, "frames_with_face": 20, "fraction_flagged": 0.5, "audio_checked": False},
        "interpretation": "Scores are probabilistic estimates from pretrained models.",
    }
    for sensitive in (ANALYSIS_ID, "https://", "original-filename", "private-raw-data", "private-token", "<b>m</b>"):
        assert sensitive.encode() not in report


def test_report_keeps_zero_and_valid_windows_when_optional_fields_are_missing_or_malformed():
    audio = json.loads(scan_report_json({
        "media_type": "audio",
        "verdict": "uncertain",
        "fake_probability": float("nan"),
        "details": {"duration_s": -3},
        "segments": [
            None,
            {"start": 5, "end": 3, "fake_probability": 0.5},
            {"start": 0, "end": 4, "fake_probability": 0},
            {"start": 4, "end": 8, "fake_probability": True},
        ],
        "scores": [{"task": "unknown-task", "fake_probability": 0.5}],
    }))
    assert audio["fake_probability"] is None
    assert audio["coverage"] == {}
    assert audio["scores"] == []
    assert audio["segment_type"] == "speech_window"
    assert audio["segments"] == [{"start_s": 0, "end_s": 4, "fake_probability": 0}]
    still = json.loads(scan_report_json({"media_type": "image", "details": {"faces_found": 0}}))
    assert still["coverage"] == {"faces_found": 0}
    assert still["segments"] == [] and still["segment_type"] is None


@pytest.mark.parametrize("body", [b"invalid JSON", b"[]", b'{"analysis_id": "a different result"}'])
def test_analysis_lookup_checks_response_identity(body):
    async def run():
        client = _client(lambda _req: httpx.Response(200, content=body))
        try:
            with pytest.raises(ApiError, match="invalid report") as error:
                await client.get_analysis(ANALYSIS_ID)
            assert error.value.status == 502
        finally:
            await client.aclose()

    asyncio.run(run())


@pytest.fixture
def telegram_transport(monkeypatch):
    state = SimpleNamespace(calls=[], fail_delivery=False)

    async def request(_request, url, method, request_data=None, **_timeouts):
        operation = url.rsplit("/", 1)[-1]
        params = request_data.parameters if request_data else {}
        parts = request_data.multipart_data if request_data else {}
        state.calls.append((operation, params, parts))
        if operation == "fixture.upload":
            return 200, b"fixture bytes"
        if operation == "getMe":
            result = BOT
        elif operation == "getFile":
            result = {**FILE, "file_path": "fixture.upload"}
        elif operation in {"sendChatAction", "answerCallbackQuery"}:
            result = True
        elif operation in {"sendMessage", "editMessageText", "sendDocument"}:
            if operation == "sendDocument" and state.fail_delivery:
                return 400, b'{"ok":false,"description":"Bad Request: fixture report delivery failed"}'
            chat = DIRECT if params["chat_id"] == DIRECT["id"] else GROUP
            result = {
                "message_id": params.get("message_id", 100 + len(state.calls)),
                "date": 1,
                "chat": chat,
                "from": BOT,
                "text": params.get("text", ""),
            }
            state.last_message = result
        else:
            pytest.fail(f"Unexpected Telegram request {operation}")
        return 200, json.dumps({"ok": True, "result": result}).encode()

    monkeypatch.setattr(HTTPXRequest, "do_request", request)
    return state


@asynccontextmanager
async def _bot_application(host, settings=SETTINGS):
    app = build_application(settings)
    client = _client(host)
    app.bot_data.update(client=client, limiter=UserLimiter(per_window=6))
    try:
        async with app:
            yield app
    finally:
        await client.aclose()


async def _send_media(app, kind, chat=DIRECT):
    media = {
        "image": {"photo": [{**FILE, "width": 100, "height": 100}]},
        "audio": {"voice": {**FILE, "duration": 8}},
        "video": {"video": {**FILE, "width": 100, "height": 100, "duration": 6}},
    }
    await app.process_update(Update.de_json({
        "update_id": 1,
        "message": {"message_id": 10, "date": 1, "chat": chat, "from": SENDER, **media[kind]},
    }, app.bot))


async def _press_report(app, data, message, sender=SENDER):
    await app.process_update(Update.de_json({
        "update_id": 2,
        "callback_query": {"id": "fixture-callback", "from": sender, "chat_instance": "1", "data": data, "message": message},
    }, app.bot))


@pytest.mark.parametrize("kind", ["image", "audio", "video"])
def test_completed_scans_deliver_a_report_via_the_telegram_transport(kind, telegram_transport):
    result = {**RESULT, "analysis_id": ANALYSIS_ID, "media_type": kind}
    host_calls = []

    def host(request):
        path = request.url.path.removeprefix("/api/v1")
        host_calls.append((request.method, path))
        if path == f"/analyze/{kind}":
            assert b"fixture bytes" in request.content
            if kind == "video":
                return httpx.Response(202, json={"job_id": "job", "status": "queued"})
            return httpx.Response(200, json=result)
        if path == "/jobs/job":
            if host_calls.count(("GET", "/jobs/job")) == 1:
                return httpx.Response(200, json={"status": "running", "stage": "frames", "progress": 0.5})
            return httpx.Response(200, json={"status": "done", "result": result})
        assert path == f"/analyses/{ANALYSIS_ID}" and request.method == "GET"
        assert telegram_transport.calls[-1][0] == "answerCallbackQuery"
        return httpx.Response(200, json=result)

    async def run():
        async with _bot_application(host) as app:
            await _send_media(app, kind)
            summary = telegram_transport.last_message
            operation = "editMessageText" if kind == "video" else "sendMessage"
            method, params, _ = telegram_transport.calls[-1]
            assert method == operation and "Likely AI-generated" in params["text"]
            if kind == "video":
                progress, final = [params for method, params, _ in telegram_transport.calls if method == "editMessageText"]
                assert "50%" in progress["text"] and "reply_markup" not in progress
                assert final["message_id"] == summary["message_id"]
            button = params["reply_markup"]["inline_keyboard"][0][0]
            assert button["text"] == "Download scan report"
            await _press_report(app, button["callback_data"], summary)
            method, params, parts = telegram_transport.calls[-1]
            assert method == "sendDocument"
            assert params["reply_parameters"]["message_id"] == summary["message_id"]
            [(filename, data, content_type)] = parts.values()
            assert filename == REPORT_FILENAME and content_type == "application/json"
            assert json.loads(data)["media_type"] == kind
            assert ANALYSIS_ID.encode() not in data

    asyncio.run(run())
    expected = [("POST", f"/analyze/{kind}")]
    if kind == "video":
        expected.extend([("GET", "/jobs/job")] * 2)
    assert host_calls == [*expected, ("GET", f"/analyses/{ANALYSIS_ID}")]


def test_group_results_keep_the_summary_and_other_senders_cannot_fetch_details(telegram_transport):
    def host(request):
        assert request.method == "POST"
        return httpx.Response(200, json={**RESULT, "media_type": "image", "analysis_id": ANALYSIS_ID})

    async def run():
        async with _bot_application(host) as app:
            await _send_media(app, "image", GROUP)
            group_summary = telegram_transport.last_message
            _, params, _ = telegram_transport.calls[-1]
            assert "Likely AI-generated" in params["text"]
            assert "reply_markup" not in params
            auth = report_button_data(ANALYSIS_ID, token=SETTINGS.token, chat_id=DIRECT["id"], user_id=SENDER["id"])
            await _press_report(app, auth, group_summary)
            assert telegram_transport.calls[-1][0] == "answerCallbackQuery"
            assert telegram_transport.calls[-1][1]["show_alert"] is True
            await _press_report(app, auth, {**group_summary, "chat": DIRECT}, sender={**SENDER, "id": 987})
            assert telegram_transport.calls[-1][0] == "answerCallbackQuery"
            assert telegram_transport.calls[-1][1]["show_alert"] is True

    asyncio.run(run())


def test_report_retains_the_bot_chat_allowlist(telegram_transport):
    def host(_request):
        pytest.fail("A disallowed chat reached the API")

    async def run():
        data = report_button_data(ANALYSIS_ID, token=SETTINGS.token, chat_id=DIRECT["id"], user_id=SENDER["id"])
        message = {"message_id": 22, "date": 1, "chat": DIRECT, "from": BOT, "text": "Scan summary"}
        settings = BotSettings(token=SETTINGS.token, allowed_chat_ids=frozenset({999}))
        async with _bot_application(host, settings) as app:
            await _press_report(app, data, message)
        method, params, _ = telegram_transport.calls[-1]
        assert method == "answerCallbackQuery" and params["show_alert"] is True

    asyncio.run(run())


@pytest.mark.parametrize(("status", "label"), [
    (404, "Send the media again"),
    (429, "Try again in 12 seconds"),
    (503, "temporarily unavailable"),
    (200, "Telegram could not send the report"),
])
def test_failed_or_expired_report_keeps_the_scan_and_explains_recovery(status, label, telegram_transport):
    result = {**RESULT, "analysis_id": ANALYSIS_ID}

    def host(request):
        assert request.method == "GET"
        if status == 200:
            return httpx.Response(200, json=result)
        return httpx.Response(status, json={"error": "private service text"}, headers={"Retry-After": "12"})

    telegram_transport.fail_delivery = status == 200

    async def run():
        data = report_button_data(ANALYSIS_ID, token=SETTINGS.token, chat_id=DIRECT["id"], user_id=SENDER["id"])
        message = {"message_id": 22, "date": 1, "chat": DIRECT, "from": BOT, "text": "Scan summary"}
        async with _bot_application(host) as app:
            await _press_report(app, data, message)
            method, params, _ = telegram_transport.calls[-1]
            assert method == "sendMessage" and label in params["text"]
            assert "private service text" not in params["text"]
            assert not any(call[0] == "editMessageText" for call in telegram_transport.calls)
            if status == 200:
                telegram_transport.fail_delivery = False
                await _press_report(app, data, message)
                assert telegram_transport.calls[-1][0] == "sendDocument"

    asyncio.run(run())
