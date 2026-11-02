"""Face-manipulation detector: Xicor9/efficientnet-b0-ffpp-c23 (EfficientNet-B0 CNN).

* Input: Haar-cascade face crops (25% margin), resized to 224x224, ``ToTensor()``;
  ImageNet normalisation only if the benchmark chose it (``MML_FACE_MODEL_NORMALIZE``).
* Output: softmax over 2 classes, index 1 = fake (per the model card).
* Grad-CAM: computed on ``model.features[-1]`` for the fake class (design doc Section 5).

The weights are a plain ``.pth`` state dict, loaded into torchvision's
EfficientNet-B0 with a 2-way classifier. ``download_models.py`` caches the file in
``TORCH_HOME`` so workers never touch the network at runtime.
"""

from __future__ import annotations

import hashlib
import os
import time
from typing import Any

from app.core.metrics import MODEL_SECONDS
from app.detectors.base import Detector, FaceScore
from app.preprocessing.faces import detect_faces, ensure_face_cropper

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]
FAKE_INDEX = 1


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


class EfficientNetFaceDetector(Detector):
    media_type = "face"

    def __init__(
        self,
        model_id: str,
        weights_url: str,
        sha256: str | None = None,
        device: str = "cpu",
        normalize: bool = False,
        margin: float = 0.25,
        max_faces: int = 4,
    ):
        super().__init__()
        self.name = model_id
        self.weights_url = weights_url
        self.sha256 = sha256
        self.revision = f"sha256:{sha256[:12]}" if sha256 else "unpinned"
        self.device = device
        self.normalize = normalize
        self.margin = margin
        self.max_faces = max_faces
        self.model: Any = None
        self.tf: Any = None

    # ------------------------------------------------------------------ load
    def load(self) -> None:
        import torch  # noqa: PLC0415
        import torch.nn as nn  # noqa: PLC0415
        from torch.hub import get_dir  # noqa: PLC0415
        from torchvision import models, transforms  # noqa: PLC0415

        # Resolve the cached weight file (download_models.py puts it here).
        cached = os.path.join(get_dir(), "checkpoints", os.path.basename(self.weights_url))
        if not os.path.exists(cached):
            # Development convenience only; production runs with the cache pre-filled.
            # torch.hub does not create the folder, and a fresh machine has no ~/.cache/torch yet.
            os.makedirs(os.path.dirname(cached), exist_ok=True)
            torch.hub.download_url_to_file(self.weights_url, cached, progress=False)
        if self.sha256 and _sha256(cached) != self.sha256:
            raise RuntimeError("Face model weights failed the SHA-256 check; refusing to load.")

        state = torch.load(cached, map_location=self.device, weights_only=True)
        # Accept a bare state dict or a training checkpoint wrapping one,
        # with or without the "module." prefix left by DataParallel.
        if isinstance(state, dict) and "state_dict" in state:
            state = state["state_dict"]
        state = {k.removeprefix("module."): v for k, v in state.items()}
        model = models.efficientnet_b0(weights=None)
        model.classifier[1] = nn.Linear(model.classifier[1].in_features, 2)
        model.load_state_dict(state)
        self.model = model.to(self.device).eval()  # eval(): dropout/batch-norm in inference mode

        ensure_face_cropper()  # fail now (loaded=false), not on the first request

        steps = [transforms.Resize((224, 224)), transforms.ToTensor()]
        if self.normalize:
            steps.append(transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD))
        self.tf = transforms.Compose(steps)

    # --------------------------------------------------------------- scoring
    def score_crops(self, crops: list[Any]) -> list[float]:
        """Batched P(fake) for PIL face crops (one forward pass for all faces)."""
        import torch  # noqa: PLC0415

        self.ensure_loaded()
        if not crops:
            return []
        t0 = time.perf_counter()
        with torch.inference_mode():
            batch = torch.stack([self.tf(c.convert("RGB")) for c in crops]).to(self.device)
            probs = torch.softmax(self.model(batch), dim=1)[:, FAKE_INDEX]
        MODEL_SECONDS.labels(self.name).observe(time.perf_counter() - t0)
        return [float(p) for p in probs.cpu().tolist()]

    def detect(self, img: Any) -> list[FaceScore]:
        """Crop faces from a PIL image and score them; [] when no face is found."""
        found = detect_faces(img, margin=self.margin, max_faces=self.max_faces)
        if not found:
            return []
        probs = self.score_crops([crop for _, crop in found])
        return [FaceScore(box=box, fake_probability=p, crop=crop) for (box, crop), p in zip(found, probs, strict=True)]

    # -------------------------------------------------------------- Grad-CAM
    def explain(self, faces: list[FaceScore]) -> list[Any]:
        """Grad-CAM heatmaps (224x224 float arrays in [0, 1]) for the fake class.

        Grad-CAM weights each channel of the last conv block by the mean gradient
        of the fake logit, sums them and keeps the positive part. It needs
        gradients, so it runs outside ``torch.inference_mode()``.
        """
        import torch  # noqa: PLC0415
        import torch.nn.functional as F  # noqa: PLC0415

        self.ensure_loaded()
        if not faces:
            return []
        target_layer = self.model.features[-1]
        captured: dict[str, Any] = {}
        handle = target_layer.register_forward_hook(lambda _m, _i, out: captured.__setitem__("act", out))
        try:
            x = torch.stack([self.tf(f.crop.convert("RGB")) for f in faces]).to(self.device)
            x.requires_grad_(False)
            with torch.enable_grad():
                logits = self.model(x)
                acts = captured["act"]  # [N, C, h, w]
                grads = torch.autograd.grad(logits[:, FAKE_INDEX].sum(), acts)[0]
            weights = grads.mean(dim=(2, 3), keepdim=True)  # [N, C, 1, 1]
            cam = F.relu((weights * acts).sum(dim=1, keepdim=True))  # [N, 1, h, w]
            cam = F.interpolate(cam, size=(224, 224), mode="bilinear", align_corners=False)[:, 0]
            # Normalise each map to [0, 1]; a flat map (no evidence) stays all zeros.
            flat = cam.flatten(1)
            lo, hi = flat.min(dim=1).values, flat.max(dim=1).values
            span = (hi - lo).clamp_min(1e-8)
            cam = (cam - lo[:, None, None]) / span[:, None, None]
            return [m.detach().cpu().numpy() for m in cam]
        finally:
            handle.remove()
