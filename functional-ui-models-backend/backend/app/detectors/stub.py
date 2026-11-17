"""Deterministic stand-ins for the real detectors (``MML_DETECTOR_BACKEND=stub``).

Used by CI, the integration test stack and frontend development on machines
without the model weights. They implement the same methods as the real
detectors, import no ML libraries, and return fixed, configurable scores so
every API path (verdict bands, timelines, Grad-CAM, errors) can be exercised.
"""

from __future__ import annotations

import math
import os
from typing import Any

from app.core.errors import AnalysisError, Cancelled, NoFaceFound
from app.detectors.base import (
    CancelFn,
    DetectionResult,
    Detector,
    FaceScore,
    FrameFaces,
    ProgressFn,
    SegmentScore,
    VideoAnalysis,
)


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


class StubImageDetector(Detector):
    media_type = "image"

    def __init__(self, name: str, p: float | None = None):
        super().__init__()
        self.name, self.revision = name, "stub"
        self.p = p if p is not None else _env_float("MML_STUB_IMAGE_P", 0.9)

    def load(self) -> None:
        pass

    def predict_pil(self, img: Any) -> float:
        return self.p


class StubFaceDetector(Detector):
    """Finds one face covering the centre half of any image unless faces=False."""

    media_type = "face"

    def __init__(self, name: str, p: float | None = None, faces: bool = True):
        super().__init__()
        self.name, self.revision = name, "stub"
        self.p = p if p is not None else _env_float("MML_STUB_FACE_P", 0.8)
        self.faces = faces

    def load(self) -> None:
        pass

    def detect(self, img: Any) -> list[FaceScore]:
        if not self.faces:
            return []
        w, h = img.size
        box = (w // 4, h // 4, 3 * w // 4, 3 * h // 4)
        return [FaceScore(box=box, fake_probability=self.p, crop=img.crop(box))]

    def explain(self, faces: list[FaceScore]) -> list[Any]:
        import numpy as np  # noqa: PLC0415

        yy, xx = np.mgrid[0:224, 0:224]
        blob = np.exp(-(((xx - 112) ** 2 + (yy - 96) ** 2) / (2 * 40.0**2)))  # one warm spot
        return [blob.astype("float32") for _ in faces]


class StubAudioDetector(Detector):
    media_type = "audio"

    def __init__(self, name: str, p: float | None = None, window_s: float = 4.0):
        super().__init__()
        self.name, self.revision = name, "stub"
        self.p = p if p is not None else _env_float("MML_STUB_AUDIO_P", 0.2)
        self.window_s = window_s

    def load(self) -> None:
        pass

    def predict(self, path: str) -> DetectionResult:
        import soundfile as sf  # noqa: PLC0415

        try:
            info = sf.info(path)
            duration = info.frames / info.samplerate
        except Exception:  # noqa: BLE001 – non-WAV in stub mode: assume 8 s
            duration = 8.0
        if duration < 0.5:
            raise AnalysisError("Audio is shorter than 0.5 seconds.", 422)
        n = max(1, math.ceil(duration / self.window_s))
        segs = [SegmentScore(i * self.window_s, min((i + 1) * self.window_s, duration), self.p) for i in range(n)]
        return DetectionResult(self.p, self.name, segs, extra={"duration_s": round(duration, 2)})


class StubVideoDetector(Detector):
    media_type = "video"

    def __init__(self, face: StubFaceDetector, n_frames: int = 24, threshold: float = 0.5):
        super().__init__()
        self.face, self.name, self.revision = face, face.name, "stub"
        self.n_frames, self.threshold = n_frames, threshold

    def load(self) -> None:
        pass

    def analyse(
        self, path: str, progress: ProgressFn | None = None, cancelled: CancelFn | None = None
    ) -> VideoAnalysis:
        from PIL import Image  # noqa: PLC0415

        if not self.face.faces:
            raise NoFaceFound()
        frame = Image.new("RGB", (320, 240), (128, 128, 128))
        frames, segs = [], []
        for k in range(self.n_frames):
            if cancelled and cancelled():
                raise Cancelled()
            t = k * 0.5
            p = round(0.5 + 0.3 * math.sin(k / 3), 4)  # a visible wave on the timeline
            faces = [FaceScore(box=(80, 60, 240, 180), fake_probability=p, crop=frame.crop((80, 60, 240, 180)))]
            frames.append(FrameFaces(time_s=t, faces=faces))
            segs.append(SegmentScore(t, t + 0.04, p))
            if progress:
                progress((k + 1) / self.n_frames)
        probs = [s.fake_probability for s in segs]
        mean = sum(probs) / len(probs)
        return VideoAnalysis(
            result=DetectionResult(
                mean,
                self.name,
                segs,
                extra={
                    "frames_sampled": self.n_frames,
                    "frames_with_face": self.n_frames,
                    "max_frame_probability": max(probs),
                    "fraction_flagged": sum(p >= self.threshold for p in probs) / len(probs),
                },
            ),
            frames=frames,
        )
