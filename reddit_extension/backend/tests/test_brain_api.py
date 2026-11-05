"""
tests/test_brain_api.py – Extension API endpoints running on the STUB brain (no host backend needed).

Label: RUNTIME (FastAPI TestClient, real sqlite file, real ffmpeg for the video case). The
schema-parity check at the bottom is STATIC (reads the zod source).
"""

from __future__ import annotations

import glob
import os
import re
import sqlite3
import struct
import tempfile
import zlib
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi.testclient import TestClient  # noqa: E402

from moody_lens_ext import store  # noqa: E402
from moody_lens_ext.brain import registry  # noqa: E402
from moody_lens_ext.brain.interface import BrainInfo, Capabilities, ExplainRegion, ExplainResult  # noqa: E402
from moody_lens_ext.brain.stub_brain import StubBrain  # noqa: E402
from moody_lens_ext.host_compat import HOST_IMPORTABLE  # noqa: E402
from moody_lens_ext.services import video_prep  # noqa: E402

API = "/api/v1"


def png(seed: int) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    rows = b"".join(b"\x00" + bytes((x * seed + y) % 256 for x in range(48)) for y in range(16))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 16, 16, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


class CountingStub(StubBrain):
    def __init__(self) -> None:
        self.image_calls = 0

    def analyze_image(self, path):
        self.image_calls += 1
        return super().analyze_image(path)


@pytest.fixture
def api(monkeypatch, tmp_path):
    monkeypatch.setenv("MML_BRAIN", "stub")
    monkeypatch.setenv("MML_EXT_DATA_DIR", str(tmp_path / "data"))
    registry.set_brain(None)
    from moody_lens_ext.media import EXTENSION_JOBS, RETAINED_MEDIA
    from moody_lens_ext.standalone import app

    EXTENSION_JOBS.clear()
    before = set(glob.glob(os.path.join(tempfile.gettempdir(), "mml-ext-*")))
    yield TestClient(app)
    registry.set_brain(None)
    RETAINED_MEDIA.clear()
    assert set(glob.glob(os.path.join(tempfile.gettempdir(), "mml-ext-*"))) - before == set(), "temp files leaked"


def scan(api, data: bytes) -> dict:
    res = api.post(f"{API}/detect", files={"media": ("a.png", data, "image/png")}, data={"media_type": "image"})
    assert res.status_code == 202, res.text
    return api.get(f"{API}/jobs/{res.json()['job_id']}").json()


# ── brain/status, detect ────────────────────────────────────────────────────

def test_brain_status_reports_the_stub_as_mock(api):
    body = api.get(f"{API}/brain/status").json()
    assert body["is_mock"] is True and body["healthy"] is True
    assert set(body["capabilities"]) == {"image", "face", "audio", "video", "explain"}
    assert body["capabilities"]["explain"] is False


def test_detect_image_is_marked_mock_and_carries_signals(api):
    job = scan(api, png(3))
    assert job["status"] == "completed" and job["mock"] is True
    assert job["models"]["face"] is None and job["models"]["audio"] is None  # did not run
    assert job["signals"] and job["timeline"] is None
    assert re.fullmatch(r"[0-9a-f]{64}", job["cache_key"])


def test_unknown_media_type_and_garbage_are_rejected_cleanly(api):
    bad = api.post(f"{API}/detect", files={"media": ("a.png", b"not an image at all", "image/png")}, data={"media_type": "image"})
    assert bad.status_code == 415 and bad.json()["code"] == "UNSUPPORTED_MEDIA_TYPE"
    assert api.post(f"{API}/detect", data={"media_type": "image"}).status_code == 422


@pytest.mark.skipif(not video_prep.ffmpeg_available(), reason="ffmpeg/ffprobe not installed")
def test_video_with_audio_gets_timeline_and_audio_model(api, tmp_path):
    import subprocess

    v, a = tmp_path / "v.mp4", tmp_path / "a.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=2", "-pix_fmt", "yuv420p", str(v)], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=duration=2", "-c:a", "aac", str(a)], check=True)
    res = api.post(
        f"{API}/detect",
        files={"media": ("v.mp4", v.read_bytes(), "video/mp4"), "audio": ("a.mp4", a.read_bytes(), "audio/mp4")},
        data={"media_type": "video"},
    )
    assert res.status_code == 202
    job = api.get(f"{API}/jobs/{res.json()['job_id']}").json()
    assert job["models"]["audio"] is not None and job["models"]["image"] is not None
    assert job["timeline"] and all(0 <= p["start"] < p["end"] <= 2.5 for p in job["timeline"])


# ── verdict cache, lookup ───────────────────────────────────────────────────

def test_repost_is_served_from_cache_without_calling_the_brain(api):
    brain = CountingStub()
    registry.set_brain(brain)
    first = scan(api, png(5))
    second = scan(api, png(5))
    assert brain.image_calls == 1
    assert first["overall_score"] == second["overall_score"] and second["cache_key"] == first["cache_key"]
    scan(api, png(6))
    assert brain.image_calls == 2


def test_lookup_hit_miss_and_validation(api):
    job = scan(api, png(7))
    hit = api.get(f"{API}/verdicts/lookup", params={"sha256": job["cache_key"]})
    assert hit.status_code == 200 and hit.json()["overall_score"] == job["overall_score"] and hit.json()["mock"] is True
    assert api.get(f"{API}/verdicts/lookup", params={"sha256": "0" * 64}).status_code == 404
    assert api.get(f"{API}/verdicts/lookup", params={"sha256": "xyz"}).status_code == 400
    assert api.get(f"{API}/verdicts/lookup").status_code == 400


def test_cached_demo_verdict_is_not_served_to_a_different_brain(api):
    job = scan(api, png(8))

    class RealishBrain(StubBrain):
        def describe(self):
            return BrainInfo("Real model", "1.0", Capabilities(image=True), is_mock=False)

    registry.set_brain(RealishBrain())
    assert api.get(f"{API}/verdicts/lookup", params={"sha256": job["cache_key"]}).status_code == 404


def test_store_phash_matching_when_hashes_are_close(tmp_path):
    db = store.ExtStore(tmp_path / "x.sqlite3")
    db.put_verdict("a" * 64, "b1", "image", {"overall_score": 0.5}, phash="ffff000000000000")
    assert db.find_by_phash("fffe000000000000", "b1") is not None  # 1 bit apart
    assert db.find_by_phash("0000ffff00000000", "b1") is None
    assert db.find_by_phash("ffff000000000000", "other-brain") is None


# ── batch ───────────────────────────────────────────────────────────────────

def test_batch_reports_each_image_and_the_most_suspicious_as_headline(api):
    files = [("media", (f"{i}.png", png(i + 2), "image/png")) for i in range(4)]
    res = api.post(f"{API}/detect/batch", files=files)
    assert res.status_code == 202
    job = api.get(f"{API}/jobs/{res.json()['job_id']}").json()
    assert job["status"] == "completed" and len(job["items"]) == 4
    scores = [i["overall_score"] for i in job["items"]]
    assert job["overall_score"] == max(scores)
    assert job["mock"] is True and [i["index"] for i in job["items"]] == [0, 1, 2, 3]


def test_batch_limits_and_atomic_validation(api):
    too_many = [("media", (f"{i}.png", png(i + 1), "image/png")) for i in range(11)]
    assert api.post(f"{API}/detect/batch", files=too_many).status_code == 400
    assert api.post(f"{API}/detect/batch").status_code == 422
    mixed = [("media", ("a.png", png(2), "image/png")), ("media", ("b.png", b"garbage bytes", "image/png"))]
    assert api.post(f"{API}/detect/batch", files=mixed).status_code == 415


def test_batch_analyses_duplicate_images_once(api):
    brain = CountingStub()
    registry.set_brain(brain)
    files = [("media", ("a.png", png(4), "image/png")), ("media", ("b.png", png(4), "image/png"))]
    api.post(f"{API}/detect/batch", files=files)
    assert brain.image_calls == 1


# ── explain ─────────────────────────────────────────────────────────────────

def test_explain_is_501_for_a_brain_without_the_capability(api):
    job = scan(api, png(9))
    res = api.get(f"{API}/jobs/{job['job_id']}/explain")
    assert res.status_code == 501 and res.json()["code"] == "NOT_IMPLEMENTED"


def test_explain_works_for_an_explain_capable_brain_and_cleans_up(api):
    class Explaining(StubBrain):
        def describe(self):
            return BrainInfo("Explainer", "1", Capabilities(image=True, explain=True), is_mock=True)

        def explain(self, path):
            assert os.path.exists(path)
            return ExplainResult("Top-left looks edited.", [ExplainRegion(0.1, 0.1, 0.3, 0.3, 0.8)], mock=True)

    registry.set_brain(Explaining())
    job = scan(api, png(10))
    res = api.get(f"{API}/jobs/{job['job_id']}/explain")
    assert res.status_code == 200 and res.json()["regions"][0]["score"] == 0.8
    assert api.get(f"{API}/jobs/job-unknown/explain").status_code == 404


# ── feedback ────────────────────────────────────────────────────────────────

def test_feedback_is_stored_without_media_or_identifiers(api, tmp_path):
    job = scan(api, png(11))
    body = {"cache_key": job["cache_key"], "verdict_label": job["label"], "user_label": "looks_wrong", "note": "obviously real"}
    assert api.post(f"{API}/feedback", json=body).status_code == 201
    assert store.get_store().feedback_count() == 1
    with sqlite3.connect(tmp_path / "data" / "extension.sqlite3") as conn:
        columns = [r[1] for r in conn.execute("PRAGMA table_info(feedback)")]
    assert columns == ["id", "cache_key", "verdict_label", "user_label", "note", "created_at"]


@pytest.mark.parametrize(
    "patch",
    [{"user_label": "maybe"}, {"verdict_label": "fake"}, {"cache_key": "short"}, {"note": "x" * 501}],
)
def test_feedback_validates_input(api, patch):
    body = {"cache_key": "a" * 64, "verdict_label": "likely_fake", "user_label": "looks_right", **patch}
    assert api.post(f"{API}/feedback", json=body).status_code == 422


# ── brain selection ─────────────────────────────────────────────────────────

@pytest.mark.skipif(HOST_IMPORTABLE, reason="auto mode picks the real host when it is importable")
def test_auto_without_host_is_503_unless_mock_is_allowed(api, monkeypatch):
    monkeypatch.setenv("MML_BRAIN", "auto")
    monkeypatch.delenv("MML_ALLOW_MOCK", raising=False)
    res = api.post(f"{API}/detect", files={"media": ("a.png", png(2), "image/png")}, data={"media_type": "image"})
    assert res.status_code == 503 and res.json()["code"] == "SERVICE_UNAVAILABLE"
    assert api.get(f"{API}/brain/status").status_code == 503
    monkeypatch.setenv("MML_ALLOW_MOCK", "true")
    assert api.get(f"{API}/brain/status").json()["is_mock"] is True


def test_unknown_brain_mode_is_a_clear_503(api, monkeypatch):
    monkeypatch.setenv("MML_BRAIN", "banana")
    assert api.get(f"{API}/brain/status").status_code == 503


# ── schema parity with the extension's zod schema (STATIC) ──────────────────

SCHEMA_TS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "core" / "schema.ts"


def zod_keys(name: str) -> set[str]:
    source = SCHEMA_TS.read_text()
    match = re.search(rf"export const {name} = z\.object\(\{{\n(.*?)\n\}}\);", source, re.S)
    assert match, f"{name} not found in schema.ts"
    return set(re.findall(r"^  (\w+):", match.group(1), re.M))


def test_pydantic_fields_match_zod_fields_STATIC():
    from moody_lens_ext import media

    pairs = {
        "DetectionJobSchema": media.DetectionJob,
        "BatchItemSchema": media.BatchItem,
        "TimelineEntrySchema": media.TimelineEntry,
        "SignalEntrySchema": media.SignalEntry,
        "BrainStatusSchema": media.BrainStatusResponse,
        "BrainCapabilitiesSchema": media.BrainCapabilities,
        "HealthResponseSchema": media.HealthResponse,
    }
    for zod_name, model in pairs.items():
        assert zod_keys(zod_name) == set(model.model_fields), zod_name
