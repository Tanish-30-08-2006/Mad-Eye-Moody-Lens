"""
tests/test_brain_contract.py – Runs the reusable brain contract suite against each brain.

Label: RUNTIME for the stub (real ffmpeg for the video/audio cases). The host brain case runs only
when the host backend (`app.*`) is importable; otherwise it is skipped.
"""

from __future__ import annotations

import pytest

from moody_lens_ext.brain.contract_tests import BrainContractSuite
from moody_lens_ext.brain.interface import BrainUnsupported, label_for
from moody_lens_ext.brain.stub_brain import StubBrain


class TestStubBrainContract(BrainContractSuite):
    @pytest.fixture
    def brain(self):
        return StubBrain()


class TestHostBrainContract(BrainContractSuite):
    @pytest.fixture
    def brain(self):
        pytest.importorskip("app.main")
        from moody_lens_ext.brain.host_brain import HostBrain

        return HostBrain()


def test_stub_is_deterministic_and_marked_mock(tmp_path):
    f = tmp_path / "x.bin"
    f.write_bytes(b"same bytes")
    brain = StubBrain()
    a, b = brain.analyze_image(str(f)), brain.analyze_image(str(f))
    assert a.overall_score == b.overall_score and a.label == b.label
    assert a.mock is True and brain.describe().is_mock is True
    assert a.models["face"] is None and a.models["audio"] is None
    assert all("Demo data" in s.text for s in a.signals)


def test_stub_different_bytes_give_different_scores(tmp_path):
    scores = set()
    for i in range(6):
        f = tmp_path / f"{i}.bin"
        f.write_bytes(bytes([i]) * 64)
        scores.add(StubBrain().analyze_image(str(f)).overall_score)
    assert len(scores) > 1


def test_label_thresholds():
    assert (label_for(0.9), label_for(0.5), label_for(0.1)) == ("likely_fake", "inconclusive", "likely_real")


def test_unsupported_error_is_a_brain_error():
    from moody_lens_ext.brain.interface import BrainError

    assert issubclass(BrainUnsupported, BrainError)
