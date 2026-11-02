"""Real EfficientNet-B0 + Grad-CAM + OpenCV code paths (skipped without torch).

Uses randomly initialised weights written to the torch hub cache under the
real file name, so loading, the SHA-256 check, batching and Grad-CAM run exactly
as in production, without network access. Score *values* are meaningless here;
the benchmark script tests those with the real weights.
"""

from __future__ import annotations

import hashlib
import os

import numpy as np
import pytest
from PIL import Image

torch = pytest.importorskip("torch")
pytest.importorskip("torchvision")
pytest.importorskip("cv2")

from app.core.errors import NoFaceFound  # noqa: E402
from app.detectors.base import FaceScore  # noqa: E402
from app.detectors.face import EfficientNetFaceDetector  # noqa: E402
from app.detectors.video import VideoDetector  # noqa: E402

URL = "https://huggingface.co/Xicor9/efficientnet-b0-ffpp-c23/resolve/main/efficientnet_b0_ffpp_c23.pth"


@pytest.fixture
def weights(tmp_path, monkeypatch):
    from torchvision import models

    monkeypatch.setenv("TORCH_HOME", str(tmp_path))
    torch.hub.set_dir(str(tmp_path / "hub"))
    ckpt = tmp_path / "hub" / "checkpoints"
    ckpt.mkdir(parents=True)
    torch.manual_seed(0)
    m = models.efficientnet_b0(weights=None)
    m.classifier[1] = torch.nn.Linear(m.classifier[1].in_features, 2)
    path = ckpt / os.path.basename(URL)
    torch.save(m.state_dict(), path)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _faces(n: int) -> list[FaceScore]:
    rng = np.random.default_rng(1)
    return [
        FaceScore(
            box=(0, 0, 160, 160),
            fake_probability=0.5,
            crop=Image.fromarray(rng.integers(0, 255, (160, 160, 3), dtype=np.uint8)),
        )
        for _ in range(n)
    ]


def test_load_score_and_gradcam(weights):
    det = EfficientNetFaceDetector("Xicor9/efficientnet-b0-ffpp-c23", URL, sha256=weights)
    det.ensure_loaded()
    assert det.loaded and det.revision.startswith("sha256:")
    assert not det.model.training  # eval() mode

    probs = det.score_crops([f.crop for f in _faces(3)])
    assert len(probs) == 3 and all(0.0 <= p <= 1.0 for p in probs)

    cams = det.explain(_faces(2))
    assert len(cams) == 2
    for cam in cams:
        assert cam.shape == (224, 224)
        assert float(cam.min()) >= 0.0 and float(cam.max()) <= 1.0 + 1e-6

    # Grad-CAM must not leave hooks behind (repeat calls stay clean).
    assert not det.model.features[-1]._forward_hooks


def test_checksum_mismatch_refuses_to_load(weights):
    det = EfficientNetFaceDetector("x", URL, sha256="0" * 64)
    with pytest.raises(RuntimeError, match="SHA-256"):
        det.ensure_loaded()


def test_no_face_in_blank_image(weights):
    det = EfficientNetFaceDetector("x", URL, sha256=weights)
    assert det.detect(Image.new("RGB", (320, 240), (200, 200, 200))) == []


def test_video_without_faces_raises(weights, mp4_bytes, tmp_path):
    det = EfficientNetFaceDetector("x", URL, sha256=weights)
    video = VideoDetector(det, n_frames=6)
    path = tmp_path / "v.mp4"
    path.write_bytes(mp4_bytes)
    seen: list[float] = []
    with pytest.raises(NoFaceFound):
        video.analyse(str(path), progress=seen.append)
    assert seen and seen[-1] == 1.0  # progress reached 1.0 across all sampled frames
