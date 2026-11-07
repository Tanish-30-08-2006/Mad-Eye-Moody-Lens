"""Face cropping with OpenCV's bundled Haar cascade.

Face-deepfake models are trained on face crops, not whole frames: feeding a
full frame gives meaningless scores. The Haar cascade needs no download and
is good enough for frontal faces; swap in RetinaFace/MTCNN behind
``detect_faces`` if recall on the benchmark is poor.
"""

from __future__ import annotations

from typing import Any

_cascade: Any = None


def _get_cascade():  # type: ignore[no-untyped-def]
    """Load the bundled cascade once; raise (at model load, not per request) if missing.

    ``opencv-python-headless`` is pinned below 5: the 5.x wheels no longer ship
    the Haar cascades at ``cv2.data.haarcascades``.
    """
    global _cascade
    if _cascade is None:
        import cv2  # noqa: PLC0415 – worker-only dependency

        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        if cascade.empty():
            raise RuntimeError("OpenCV Haar cascade not found; install opencv-python-headless<5.")
        _cascade = cascade
    return _cascade


def ensure_face_cropper() -> None:
    """Called from the face detector's load() so a broken install fails the self-check."""
    _get_cascade()


def detect_faces(
    img: Any, margin: float = 0.25, min_size: int = 64, max_faces: int = 4
) -> list[tuple[tuple[int, int, int, int], Any]]:
    """Return up to ``max_faces`` (box, crop) pairs, largest face first.

    ``box`` is (x0, y0, x1, y1) in original pixel coordinates *including* the
    margin, so the frontend can place a Grad-CAM heatmap exactly over the crop.
    """
    import cv2  # noqa: PLC0415
    import numpy as np  # noqa: PLC0415

    rgb = np.asarray(img.convert("RGB"))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    boxes = _get_cascade().detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(min_size, min_size))
    boxes = sorted((tuple(int(v) for v in b) for b in boxes), key=lambda b: b[2] * b[3], reverse=True)[:max_faces]
    h, w = gray.shape
    out = []
    for x, y, bw, bh in boxes:
        dx, dy = int(bw * margin), int(bh * margin)
        x0, y0 = max(0, x - dx), max(0, y - dy)
        x1, y1 = min(w, x + bw + dx), min(h, y + bh + dy)
        out.append(((x0, y0, x1, y1), img.crop((x0, y0, x1, y1))))
    return out
