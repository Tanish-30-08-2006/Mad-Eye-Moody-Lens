"""Synthetic-speech detector: MelodyMachine/Deepfake-audio-detection-V2 (wav2vec2-family).

Audio is decoded at 16 kHz mono and scored in fixed windows (default 4 s) so
the frontend can plot where in the clip the synthetic speech sits. A trailing
piece shorter than 0.5 s is dropped; clips shorter than 0.5 s are rejected.
"""

from __future__ import annotations

import time
from typing import Any

from app.core.errors import AnalysisError
from app.core.metrics import MODEL_SECONDS
from app.detectors.base import DetectionResult, Detector, SegmentScore, check_label_map, fake_prob_from_scores

SR = 16_000
MIN_SAMPLES = SR // 2  # 0.5 s


class HFAudioDetector(Detector):
    media_type = "audio"

    def __init__(self, model_id: str, revision: str | None = None, device: str = "cpu", window_s: float = 4.0):
        super().__init__()
        self.name = model_id
        self.revision = revision or "unpinned"
        self._revision_arg = revision
        self.device = device
        self.window_s = window_s
        self.pipe: Any = None
        self.num_labels = 2

    def load(self) -> None:
        from transformers import pipeline  # noqa: PLC0415

        self.pipe = pipeline(
            "audio-classification",
            model=self.name,
            revision=self._revision_arg,
            device=0 if self.device == "cuda" else -1,
            trust_remote_code=False,
        )
        id2label = self.pipe.model.config.id2label
        check_label_map(id2label)
        self.num_labels = len(id2label)

    def predict(self, path: str) -> DetectionResult:
        import librosa  # noqa: PLC0415
        import numpy as np  # noqa: PLC0415

        self.ensure_loaded()
        try:
            wav, _ = librosa.load(path, sr=SR, mono=True)
        except Exception as exc:  # noqa: BLE001 – audioread/soundfile raise many types
            raise AnalysisError("Could not decode the audio.", 422) from exc
        if wav.size < MIN_SAMPLES:
            raise AnalysisError("Audio is shorter than 0.5 seconds.", 422)

        win = int(self.window_s * SR)
        segments: list[SegmentScore] = []
        for start in range(0, len(wav), win):
            chunk = wav[start : start + win]
            if len(chunk) < MIN_SAMPLES:  # drop a tiny trailing piece
                break
            t0 = time.perf_counter()
            scores = self.pipe({"raw": chunk, "sampling_rate": SR}, top_k=self.num_labels)
            MODEL_SECONDS.labels(self.name).observe(time.perf_counter() - t0)
            segments.append(SegmentScore(start / SR, (start + len(chunk)) / SR, fake_prob_from_scores(scores)))

        p = float(np.mean([s.fake_probability for s in segments]))
        return DetectionResult(p, self.name, segments, extra={"duration_s": round(len(wav) / SR, 2)})
