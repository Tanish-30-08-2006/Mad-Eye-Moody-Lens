"""Benchmark the real models on the held-out Sprint 1 data (design doc Sections 9, 12).

    python -m scripts.benchmark --detector face --data ../data/faces --out face.csv

Layout: <data>/real/* and <data>/fake/*. Reports accuracy, F1, ROC-AUC, EER,
latency (mean, p95) and peak RSS, which sets the container memory limits for
the 8 GB laptop. ``--baseline`` makes it exit non-zero if ROC-AUC drops more
than 0.02 below the recorded value (nightly regression gate).
"""

from __future__ import annotations

import argparse
import csv
import pathlib
import resource
import sys
import time

import numpy as np


def equal_error_rate(y, p) -> float:  # type: ignore[no-untyped-def]
    from sklearn.metrics import roc_curve

    fpr, tpr, _ = roc_curve(y, p)
    fnr = 1 - tpr
    i = int(np.nanargmin(np.abs(fnr - fpr)))
    return float((fpr[i] + fnr[i]) / 2)


def score(detector: str, path: str) -> float:
    from PIL import Image

    from app.detectors.registry import get_registry

    reg = get_registry()
    if detector == "image":
        with Image.open(path) as im:
            return reg["image"].predict_pil(im.convert("RGB"))
    if detector == "face":
        with Image.open(path) as im:
            faces = reg["face"].detect(im.convert("RGB"))
        if not faces:
            raise ValueError("no face")
        return max(f.fake_probability for f in faces)
    if detector == "audio":
        return reg["audio"].predict(path).fake_probability
    return reg["video"].analyse(path).result.fake_probability


def main() -> int:
    from sklearn.metrics import accuracy_score, f1_score, roc_auc_score

    from app.detectors.registry import get_registry

    ap = argparse.ArgumentParser()
    ap.add_argument("--detector", required=True, choices=["image", "face", "audio", "video"])
    ap.add_argument("--data", required=True)
    ap.add_argument("--limit", type=int, default=200)
    ap.add_argument("--threshold", type=float, default=0.5)
    ap.add_argument("--out", default="benchmark.csv")
    ap.add_argument("--baseline", type=float, default=None, help="recorded ROC-AUC to guard against")
    a = ap.parse_args()

    get_registry()[a.detector].ensure_loaded()
    rows, y, p, lat = [], [], [], []
    for label, cls in (("real", 0), ("fake", 1)):
        for f in sorted(pathlib.Path(a.data, label).glob("*"))[: a.limit]:
            t0 = time.perf_counter()
            try:
                prob = score(a.detector, str(f))
            except Exception as exc:  # noqa: BLE001 – log and keep going
                print(f"skip {f.name}: {exc}")
                continue
            dt = time.perf_counter() - t0
            y.append(cls)
            p.append(prob)
            lat.append(dt)
            rows.append([f.name, cls, round(prob, 4), round(dt, 3)])

    y_arr, p_arr = np.array(y), np.array(p)
    pred = (p_arr >= a.threshold).astype(int)
    auc = roc_auc_score(y_arr, p_arr)
    peak_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    print(f"model     : {get_registry()[a.detector].name}")
    print(f"n         : {len(y_arr)} (skipped files not counted)")
    print(f"accuracy  : {accuracy_score(y_arr, pred):.3f}")
    print(f"F1 (fake) : {f1_score(y_arr, pred):.3f}")
    print(f"ROC-AUC   : {auc:.3f}")
    print(f"EER       : {equal_error_rate(y_arr, p_arr):.3f}")
    print(f"latency   : mean {np.mean(lat):.2f}s, p95 {np.percentile(lat, 95):.2f}s")
    print(f"peak RSS  : {peak_mb:.0f} MB")
    with open(a.out, "w", newline="") as fh:
        csv.writer(fh).writerows([["file", "label", "p_fake", "seconds"], *rows])

    if a.baseline is not None and auc < a.baseline - 0.02:
        print(f"REGRESSION: ROC-AUC {auc:.3f} < baseline {a.baseline:.3f} - 0.02")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
