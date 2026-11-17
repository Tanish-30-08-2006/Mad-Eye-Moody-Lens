"""Aggregation and verdict bands (design doc Section 5).

* Overall score = max over the individual checks (``MML_AGGREGATION=max``): one
  suspicious detector is enough to raise a flag (recall over precision).
* ``weighted`` is the documented fallback if the benchmark shows the image
  model raising false alarms on real photos with faces.
* Bands must equal the frontend's ``VITE_BAND_LOW`` / ``VITE_BAND_HIGH``.
"""

from __future__ import annotations

from app.core.config import settings
from app.schemas import ModelScore, Verdict


def verdict_for(p: float) -> Verdict:
    if p >= settings.band_high:
        return "likely_fake"
    if p <= settings.band_low:
        return "likely_real"
    return "uncertain"


def aggregate(scores: list[ModelScore]) -> float:
    if not scores:
        raise ValueError("aggregate() needs at least one score")
    if settings.aggregation == "weighted":
        w = settings.aggregation_weights
        total = sum(w.get(s.task, 1.0) for s in scores)
        value = sum(w.get(s.task, 1.0) * s.fake_probability for s in scores) / total
    else:
        value = max(s.fake_probability for s in scores)
    return round(min(max(value, 0.0), 1.0), 4)
