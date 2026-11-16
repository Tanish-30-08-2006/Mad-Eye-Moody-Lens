from types import SimpleNamespace as Result

from moody_lens_ext.brain import host_brain
from moody_lens_ext.media import _result_fields


def test_host_adapter_preserves_measured_ranges_and_the_audio_check(monkeypatch):
    brain = host_brain.HostBrain()
    result = Result(
        verdict="likely_fake", fake_probability=0.91, model_versions={"frame-fixture": "r1"},
        details={"duration_s": 8.0},
        scores=[
            Result(task="face_manipulation", fake_probability=0.91),
            Result(task="synthetic_speech", fake_probability=0.3),
        ],
        segments=[
            Result(start=2.125, end=3.5, fake_probability=0.91),
            Result(start=5.0, end=4.0, fake_probability=0.8),
            Result(start=7.0, end=9.0, fake_probability=0.9),
        ],
    )
    monkeypatch.setattr(brain, "_is_mock", lambda: False)
    monkeypatch.setattr(brain, "_host_result", lambda kind, path: result)
    payload = _result_fields(brain.analyze_video("fixture.mp4", "fixture.m4a"))
    assert payload["timeline"] == [{"start": 2.125, "end": 3.5, "score": 0.91}]
    assert payload["models"]["audio"]["score"] == 0.3
    assert payload["model_versions"] == {"frame-fixture": "r1"}
    assert payload["mock"] is False

    result.segments = []
    result.scores.pop()
    payload = _result_fields(brain.analyze_video("fixture.mp4"))
    assert payload["timeline"] is None
    assert payload["models"]["audio"] is None

    result.model_versions = {"frame-fixture": "stub"}
    assert brain.analyze_video("fixture.mp4").mock is True
