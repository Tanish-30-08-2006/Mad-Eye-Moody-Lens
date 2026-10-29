"""
SSL Anti-Spoofing Audio Adapter (unconfigured stub)
====================================================
This adapter is a placeholder that will be replaced with the actual
SSL Anti-Spoofing inference code once:

1.  The SSL_Anti-spoofing repository has been cloned into
    ``backend/vendor/SSL_Anti-spoofing/``
2.  The wav2vec 2.0 XLSR-300M checkpoint (.pth) is placed at the path
    specified in ``SSL_ANTISPOOF_CHECKPOINT``.
3.  Fairseq and torchaudio have been installed in the backend environment.

See README.md § "How to Add Pretrained Models Later → A. SSL Anti-Spoofing"
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
To integrate the SSL Anti-Spoofing model:

1. Clone the repository:
   git clone https://github.com/TakHemlata/SSL_Anti-spoofing \\
       backend/vendor/SSL_Anti-spoofing

2. Place your checkpoint at a stable path and set in .env:
   SSL_ANTISPOOF_CHECKPOINT=/absolute/path/to/your/checkpoint.pth

3. Install model-specific dependencies in a separate virtual environment
   if they conflict with the base requirements (see docs/ISOLATION.md):
   pip install fairseq torchaudio torch

4. Set AUDIO_MODEL_ENABLED=true in .env.

5. Replace the stub predict() below with the real inference call from
   the SSL_Anti-spoofing repository (Model class, forward pass).

6. Verify class mapping: index 0 = bonafide (real), index 1 = spoof (fake).

7. Run: pytest backend/tests/test_audio_inference.py
"""


class SSLAntiSpoofingAdapter(BaseModelAdapter):
    """Adapter stub for the SSL Anti-Spoofing wav2vec 2.0 XLSR audio detector."""

    model_id = "ssl_antispoof_audio"
    name = "SSL Anti-Spoofing (wav2vec 2.0 XLSR-300M)"
    modality = Modality.AUDIO
    framework = "PyTorch + Fairseq"
    expected_input = "16 kHz mono WAV audio (waveform array)"
    configuration_notes = (
        "Requires the SSL_Anti-spoofing repository source, a pretrained .pth "
        "checkpoint, and Fairseq + torchaudio. These are NOT installed by default."
    )
    integration_instructions = _INTEGRATION_INSTRUCTIONS

    def __init__(self) -> None:
        super().__init__()
        self._checkpoint_path: Optional[Path] = None

    # ── Status ────────────────────────────────────────────────────────────────

    def weight_available(self) -> bool:
        cp = settings.ssl_antispoof_checkpoint
        if not cp:
            return False
        return Path(cp).is_file()

    def runtime_available(self) -> bool:
        import importlib.util
        return (
            importlib.util.find_spec("torch") is not None
            and importlib.util.find_spec("fairseq") is not None
        )

    def get_status(self) -> ModelStatus:
        if not settings.audio_model_enabled:
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
        Load the SSL Anti-Spoofing model.

        Replace the body of this method with the actual model loading
        code from the SSL_Anti-spoofing repository once available.
        """
        if not settings.audio_model_enabled:
            logger.info("SSL Anti-Spoofing: AUDIO_MODEL_ENABLED is false – skipping load.")
            return
        if not self.runtime_available():
            logger.warning("SSL Anti-Spoofing: runtime dependencies missing – skipping load.")
            return
        if not self.weight_available():
            logger.warning("SSL Anti-Spoofing: checkpoint not found at '%s' – skipping load.",
                           settings.ssl_antispoof_checkpoint)
            return

        # ── Replace with real loading code ──────────────────────────────
        # Example (adapt to actual repository API):
        #
        #   import sys
        #   sys.path.insert(0, str(Path(__file__).parents[2] / "vendor/SSL_Anti-spoofing"))
        #   from model import Model  # from the SSL_Anti-spoofing repo
        #
        #   self._model = Model(args, device)
        #   checkpoint = torch.load(settings.ssl_antispoof_checkpoint, map_location=device)
        #   self._model.load_state_dict(checkpoint)
        #   self._model.eval()
        #   self._loaded = True
        # ───────────────────────────────────────────────────────────────
        logger.warning("SSL Anti-Spoofing: load() stub called – no real model loaded.")

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
            "Model is not configured. Load the checkpoint and enable AUDIO_MODEL_ENABLED.",
        )

    def predict(self, preprocessed: Any) -> Dict[str, Any]:
        raise ModelNotConfiguredError(
            self.model_id,
            "Model is not configured. Load the checkpoint and enable AUDIO_MODEL_ENABLED.",
        )
