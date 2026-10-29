"""
Hybrid Xception-ViT Image Adapter (unconfigured stub)
======================================================
This adapter is a placeholder that will be replaced with the actual
Hybrid Xception–Vision Transformer inference code once:

1.  The architecture source from
    https://github.com/tahangz/Hybrid-Xception-Vision-Transformer-Deepfake-Detection
    has been copied into ``backend/vendor/hybrid_xception_vit/``
2.  The pretrained checkpoint has been placed at the path specified in
    ``HYBRID_VIT_CHECKPOINT``.
3.  TensorFlow / Keras (or PyTorch, depending on the repo) has been installed.

See README.md § "How to Add Pretrained Models Later → B. Hybrid Xception-ViT"
for full integration instructions.

IMPORTANT
---------
This stub intentionally raises ModelNotConfiguredError from predict().
It does NOT return fabricated predictions.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, Optional

from app.adapters.base import BaseModelAdapter
from app.core.config import settings
from app.core.exceptions import ModelNotConfiguredError
from app.models.schemas import ModelStatus, Modality

logger = logging.getLogger(__name__)

_INTEGRATION_INSTRUCTIONS = """
To integrate the Hybrid Xception-ViT model:

1. Copy the architecture and helper files from:
   https://github.com/tahangz/Hybrid-Xception-Vision-Transformer-Deepfake-Detection
   into backend/vendor/hybrid_xception_vit/

2. Place your checkpoint at a stable path and set in .env:
   HYBRID_VIT_CHECKPOINT=/absolute/path/to/your/checkpoint.h5   # or .pt / .pth

3. Install model-specific dependencies (check the repo's requirements):
   pip install tensorflow keras  # or PyTorch equivalent

4. Set IMAGE_MODEL_ENABLED=true in .env.

5. Implement load() below using the repository's model-loading code.

6. Implement preprocess() using the repository's verified image preprocessing
   pipeline (resize, normalisation, channel order – do NOT guess).

7. Implement predict() using the repository's inference function and
   verify the class mapping (which index = real, which = fake).

8. Run: pytest backend/tests/test_image_inference.py
"""


class HybridXceptionViTAdapter(BaseModelAdapter):
    """Adapter stub for the Hybrid Xception–ViT image/video-frame detector."""

    model_id = "hybrid_xception_vit"
    name = "Hybrid Xception–Vision Transformer"
    modality = Modality.IMAGE
    framework = "TensorFlow/Keras (verify with repo)"
    expected_input = "RGB image, resized per model spec (verify with repo)"
    configuration_notes = (
        "Requires the Hybrid Xception-ViT architecture source, a pretrained checkpoint, "
        "and TensorFlow/Keras (or PyTorch). These are NOT installed by default."
    )
    integration_instructions = _INTEGRATION_INSTRUCTIONS

    def __init__(self) -> None:
        super().__init__()
        self._model: Optional[Any] = None

    # ── Status ────────────────────────────────────────────────────────────────

    def weight_available(self) -> bool:
        cp = settings.hybrid_vit_checkpoint
        if not cp:
            return False
        return Path(cp).is_file()

    def runtime_available(self) -> bool:
        import importlib.util
        for pkg in ("tensorflow", "torch"):
            if importlib.util.find_spec(pkg) is not None:
                return True
        return False

    def get_status(self) -> ModelStatus:
        if not settings.image_model_enabled:
            return ModelStatus.NOT_CONFIGURED
        if not self.runtime_available():
            return ModelStatus.MISSING_DEPENDENCIES
        if not self.weight_available():
            return ModelStatus.MISSING_WEIGHTS
        if self._error:
            return ModelStatus.ERROR
        if self._loaded:
            return ModelStatus.READY
        return ModelStatus.NOT_CONFIGURED

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def load(self) -> None:
        """
        Load the Hybrid Xception-ViT model.

        Replace the body of this method with the actual model loading
        code from the repository once available.
        """
        if not settings.image_model_enabled:
            logger.info("Hybrid Xception-ViT: IMAGE_MODEL_ENABLED is false – skipping load.")
            return
        if not self.runtime_available():
            logger.warning("Hybrid Xception-ViT: runtime dependencies missing – skipping load.")
            return
        if not self.weight_available():
            logger.warning(
                "Hybrid Xception-ViT: checkpoint not found at '%s' – skipping load.",
                settings.hybrid_vit_checkpoint,
            )
            return

        # ── Replace with real loading code ──────────────────────────────
        # Example (adapt to actual repository API):
        #
        #   import sys
        #   sys.path.insert(0, str(Path(__file__).parents[2] / "vendor/hybrid_xception_vit"))
        #   from model import build_model   # from the repo
        #
        #   self._model = build_model(weights=settings.hybrid_vit_checkpoint)
        #   self._loaded = True
        # ───────────────────────────────────────────────────────────────
        logger.warning("Hybrid Xception-ViT: load() stub called – no real model loaded.")

    # ── Inference ─────────────────────────────────────────────────────────────

    def health_check(self) -> Dict[str, Any]:
        status = self.get_status()
        return {
            "healthy": status == ModelStatus.READY,
            "status": status.value,
            "detail": "Model not configured – see integration instructions."
            if status != ModelStatus.READY
            else "Ready",
        }

    def preprocess(self, raw_input: Any) -> Any:
        raise ModelNotConfiguredError(
            self.model_id,
            "Model is not configured. Load the checkpoint and enable IMAGE_MODEL_ENABLED.",
        )

    def predict(self, preprocessed: Any) -> Dict[str, Any]:
        raise ModelNotConfiguredError(
            self.model_id,
            "Model is not configured. Load the checkpoint and enable IMAGE_MODEL_ENABLED.",
        )
