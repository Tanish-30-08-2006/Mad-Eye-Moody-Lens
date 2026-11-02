"""Fill the model volume once, then print the pins to put in .env.

    docker compose -f docker-compose.prod.yml run --rm -e HF_HUB_OFFLINE=0 \
        -e TRANSFORMERS_OFFLINE=0 worker-fast python -m scripts.download_models

Downloads the three Sprint 2 models into HF_HOME / TORCH_HOME, runs each
worker's load self-check (label map, cascade), and prints:
  MML_IMAGE_MODEL_REVISION, MML_AUDIO_MODEL_REVISION  (Hugging Face commit hashes)
  MML_FACE_MODEL_SHA256                                (checksum of the .pth)
After this, workers run with HF_HUB_OFFLINE=1 and never touch the network.
"""

from __future__ import annotations

import os
import sys

os.environ["HF_HUB_OFFLINE"] = "0"
os.environ["TRANSFORMERS_OFFLINE"] = "0"
os.environ["MML_DETECTOR_BACKEND"] = "real"


def main() -> int:
    from huggingface_hub import HfApi

    from app.core.config import settings
    from app.detectors.face import _sha256
    from app.detectors.registry import get_registry

    reg = get_registry()
    for key in ("image", "face", "audio"):
        print(f"loading {key:<6} {reg[key].name}", flush=True)
        reg[key].ensure_loaded()

    from torch.hub import get_dir

    face_file = os.path.join(get_dir(), "checkpoints", os.path.basename(settings.face_model_url))
    api = HfApi()
    print("\nAll models cached and self-checked. Pin these in .env:\n")
    print(f"MML_IMAGE_MODEL_REVISION={api.model_info(settings.image_model_id).sha}")
    print(f"MML_AUDIO_MODEL_REVISION={api.model_info(settings.audio_model_id).sha}")
    print(f"MML_FACE_MODEL_SHA256={_sha256(face_file)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
