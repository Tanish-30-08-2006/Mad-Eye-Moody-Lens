"""brain/contract_tests.py – Reusable pytest suite every DetectionBrain must pass; subclass it and provide a `brain` fixture (see tests/test_brain_contract.py)."""

from __future__ import annotations

import struct
import subprocess
import zlib
from pathlib import Path
from typing import Any, Dict

import pytest

from ..services import video_prep
from .interface import (
    LABELS,
    MODEL_KEYS,
    SEVERITIES,
    BrainResult,
    BrainUnsupported,
    DetectionBrain,
    ExplainResult,
)

needs_ffmpeg = pytest.mark.skipif(not video_prep.ffmpeg_available(), reason="ffmpeg/ffprobe not installed")


def _png_bytes() -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    rows = b"".join(b"\x00" + bytes((x * 7 + y * 3) % 256 for x in range(96)) for y in range(32))
    header = struct.pack(">IIBBBBB", 32, 32, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


def _ffmpeg(args: list[str]) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


class BrainContractSuite:
    """Rules any brain must follow. Nothing here depends on a particular model or score."""

    @pytest.fixture
    def brain(self) -> DetectionBrain:  # pragma: no cover - overridden by subclasses
        raise NotImplementedError("Provide a `brain` fixture returning the brain under test.")

    @pytest.fixture
    def samples(self, tmp_path: Path) -> Dict[str, Any]:
        d = tmp_path
        out: Dict[str, Any] = {"image": str(d / "s.png")}
        (d / "s.png").write_bytes(_png_bytes())
        if video_prep.ffmpeg_available():
            _ffmpeg(["-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=2", "-pix_fmt", "yuv420p", str(d / "v.mp4")])
            _ffmpeg(["-f", "lavfi", "-i", "sine=duration=2", "-c:a", "aac", str(d / "a.m4a")])
            out.update(video=str(d / "v.mp4"), audio=str(d / "a.m4a"), duration=2.0)
        return out

    # ── shared checks ──────────────────────────────────────────────────────

    def check_result(self, brain: DetectionBrain, result: BrainResult) -> None:
        info = brain.describe()
        assert isinstance(result, BrainResult)
        assert 0.0 <= result.overall_score <= 1.0
        assert result.label in LABELS
        # A confident score must not carry the opposite label.
        if result.overall_score >= 0.9:
            assert result.label != "likely_real"
        if result.overall_score <= 0.1:
            assert result.label != "likely_fake"

        assert set(result.models) == set(MODEL_KEYS)
        for key, out in result.models.items():
            if out is None:
                continue  # did not run: allowed, and the only honest way to say so
            assert 0.0 <= out.score <= 1.0, key
            assert 0.0 <= out.confidence <= 1.0, key
            assert isinstance(out.label, str) and out.label, key
        # A model the brain says it does not have must not report a score.
        for key in ("face", "audio"):
            if not getattr(info.capabilities, key):
                assert result.models[key] is None, f"{key} has a score but the brain lacks that capability"

        assert all(isinstance(k, str) and isinstance(v, str) for k, v in result.model_versions.items())
        assert isinstance(result.latency_ms, int) and result.latency_ms >= 0
        for sig in result.signals:
            assert sig.kind and sig.text
            assert sig.severity in SEVERITIES
        # Mock honesty: a mock brain never returns an unmarked result.
        if info.is_mock:
            assert result.mock is True

    # ── describe / healthy ─────────────────────────────────────────────────

    def test_describe_is_well_formed(self, brain: DetectionBrain) -> None:
        info = brain.describe()
        assert info.name and info.version
        assert isinstance(info.is_mock, bool)
        for flag in ("image", "face", "audio", "video", "explain"):
            assert isinstance(getattr(info.capabilities, flag), bool)
        assert isinstance(brain.healthy(), bool)

    # ── image ──────────────────────────────────────────────────────────────

    def test_image_result_is_valid(self, brain: DetectionBrain, samples: Dict[str, Any]) -> None:
        if not brain.describe().capabilities.image:
            with pytest.raises(BrainUnsupported):
                brain.analyze_image(samples["image"])
            return
        result = brain.analyze_image(samples["image"])
        self.check_result(brain, result)
        assert result.timeline == []  # timelines are a video concept

    def test_image_models_that_did_not_run_are_none(self, brain: DetectionBrain, samples: Dict[str, Any]) -> None:
        if not brain.describe().capabilities.image:
            pytest.skip("brain has no image capability")
        # An image has no sound, so the audio model cannot have run.
        assert brain.analyze_image(samples["image"]).models["audio"] is None

    # ── video ──────────────────────────────────────────────────────────────

    @needs_ffmpeg
    def test_video_result_and_timeline_bounds(self, brain: DetectionBrain, samples: Dict[str, Any]) -> None:
        if not brain.describe().capabilities.video:
            with pytest.raises(BrainUnsupported):
                brain.analyze_video(samples["video"])
            return
        result = brain.analyze_video(samples["video"], samples["audio"])
        self.check_result(brain, result)
        previous_start = -1.0
        for point in result.timeline:
            assert 0.0 <= point.score <= 1.0
            assert 0.0 <= point.start < point.end <= samples["duration"] + 0.5
            assert point.start >= previous_start  # ordered in time
            previous_start = point.start

    @needs_ffmpeg
    def test_video_without_audio_track_has_no_audio_score(self, brain: DetectionBrain, samples: Dict[str, Any]) -> None:
        if not brain.describe().capabilities.video:
            pytest.skip("brain has no video capability")
        # The sample video is silent and no audio path is given: the audio model cannot have run.
        assert brain.analyze_video(samples["video"]).models["audio"] is None

    # ── audio ──────────────────────────────────────────────────────────────

    @needs_ffmpeg
    def test_audio_result_is_valid(self, brain: DetectionBrain, samples: Dict[str, Any]) -> None:
        if not brain.describe().capabilities.audio:
            with pytest.raises(BrainUnsupported):
                brain.analyze_audio(samples["audio"])
            return
        self.check_result(brain, brain.analyze_audio(samples["audio"]))

    # ── explain ────────────────────────────────────────────────────────────

    def test_explain_matches_capability(self, brain: DetectionBrain, samples: Dict[str, Any]) -> None:
        result = brain.explain(samples["image"])
        if not brain.describe().capabilities.explain:
            assert result is None
            return
        assert isinstance(result, ExplainResult) and result.summary
        for region in result.regions:
            assert all(0.0 <= v <= 1.0 for v in (region.x, region.y, region.w, region.h, region.score))
