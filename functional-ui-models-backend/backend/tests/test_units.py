"""Pure unit tests: label mapping, verdict bands, aggregation, heatmap encoding."""

from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image

from app.core.config import settings
from app.detectors.base import check_label_map, fake_prob_from_scores, label_is_fake
from app.schemas import ModelScore
from app.services.pipelines import heatmap_to_png
from app.services.verdict import aggregate, verdict_for


@pytest.mark.parametrize("label", ["artificial", "FAKE", "spoof", "AI-generated", "deepfake"])
def test_fake_labels(label):
    assert label_is_fake(label)


@pytest.mark.parametrize("label", ["human", "Real", "bonafide", "authentic"])
def test_real_labels(label):
    assert not label_is_fake(label)


def test_unknown_label_raises():
    with pytest.raises(ValueError):
        label_is_fake("class_0")


def test_label_map_self_check():
    check_label_map({0: "artificial", 1: "human"})
    with pytest.raises(ValueError):
        check_label_map({0: "fake", 1: "spoof"})  # no real class: refuse to serve


def test_fake_prob_sums_fake_classes():
    assert fake_prob_from_scores([{"label": "fake", "score": 0.7}, {"label": "real", "score": 0.3}]) == pytest.approx(
        0.7
    )


@pytest.mark.parametrize(
    ("p", "v"),
    [(0.0, "likely_real"), (0.35, "likely_real"), (0.5, "uncertain"), (0.65, "likely_fake"), (1.0, "likely_fake")],
)
def test_bands_match_frontend(p, v):
    assert settings.band_low == 0.35 and settings.band_high == 0.65
    assert verdict_for(p) == v


def test_aggregate_max_and_weighted(monkeypatch):
    scores = [
        ModelScore(model="a", task="ai_generated_image", fake_probability=0.9),
        ModelScore(model="b", task="face_manipulation", fake_probability=0.3),
    ]
    assert aggregate(scores) == 0.9
    monkeypatch.setattr(settings, "aggregation", "weighted")
    monkeypatch.setattr(settings, "aggregation_weights", {"ai_generated_image": 1.0, "face_manipulation": 3.0})
    assert aggregate(scores) == pytest.approx((0.9 + 0.9) / 4)


def test_heatmap_png_is_greyscale_attention_only():
    cam = np.linspace(0, 1, 224 * 224, dtype="float32").reshape(224, 224)
    im = Image.open(io.BytesIO(heatmap_to_png(cam)))
    assert im.mode == "L" and im.size == (224, 224)
    arr = np.asarray(im)
    assert arr.min() == 0 and arr.max() == 255


def test_registry_is_built_once_under_concurrent_first_calls():
    """Regression: heartbeat thread + model loader raced and built two registries."""
    import threading

    from app.detectors.registry import get_registry

    get_registry.cache_clear()
    seen: list[int] = []
    barrier = threading.Barrier(8)

    def call() -> None:
        barrier.wait()
        seen.append(id(get_registry()))

    threads = [threading.Thread(target=call) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(set(seen)) == 1
