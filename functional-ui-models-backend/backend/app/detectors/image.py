"""AI-generated image detector: Organika/sdxl-detector (Swin Transformer).

Scores the whole image. The Hugging Face pipeline handles resize and
normalisation; we only convert to RGB and map labels to P(fake).
"""

from __future__ import annotations

import time
from typing import Any

from app.core.metrics import MODEL_SECONDS
from app.detectors.base import Detector, check_label_map, fake_prob_from_scores


class HFImageDetector(Detector):
    media_type = "image"

    def __init__(self, model_id: str, revision: str | None = None, device: str = "cpu"):
        super().__init__()
        self.name = model_id
        self.revision = revision or "unpinned"
        self._revision_arg = revision
        self.device = device
        self.pipe: Any = None
        self.num_labels = 2

    def load(self) -> None:
        from transformers import pipeline  # noqa: PLC0415 – worker-only

        self.pipe = pipeline(
            "image-classification",
            model=self.name,
            revision=self._revision_arg,
            device=0 if self.device == "cuda" else -1,
            trust_remote_code=False,  # never execute model-repo code
        )
        id2label = self.pipe.model.config.id2label
        check_label_map(id2label)  # refuse to serve an unmappable / inverted model
        self.num_labels = len(id2label)

    def predict_pil(self, img: Any) -> float:
        """P(AI-generated) for a PIL image."""
        self.ensure_loaded()
        t0 = time.perf_counter()
        scores = self.pipe(img.convert("RGB"), top_k=self.num_labels)
        MODEL_SECONDS.labels(self.name).observe(time.perf_counter() - t0)
        return fake_prob_from_scores(scores)
