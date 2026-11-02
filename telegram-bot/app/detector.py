"""Detector engine for Deepfake / AI-generated image detection.

Supports:
- Hugging Face transformers pipeline (default: 'Organika/sdxl-detector')
- Custom PyTorch checkpoint (.pt) matching the CIFAKE ResNet-18 architecture
- Stub backend for instant local testing without heavy downloads
"""

from __future__ import annotations

import os
import re
import time
from abc import ABC, abstractmethod
from typing import Any
from PIL import Image

FAKE_TOKENS = {"fake", "artificial", "ai", "synthetic", "deepfake", "spoof", "generated", "manipulated"}
REAL_TOKENS = {"real", "human", "bonafide", "bona", "authentic", "genuine", "original"}


def label_is_fake(label: str) -> bool:
    """Map model label string to fake (True) or real (False)."""
    tokens = set(re.split(r"[^a-z0-9]+", label.lower()))
    if tokens & REAL_TOKENS:
        return False
    if tokens & FAKE_TOKENS:
        return True
    # Fallback heuristic
    clean = label.lower().strip()
    if "fake" in clean or "synth" in clean or "ai" in clean:
        return True
    return False


class BaseDetector(ABC):
    def __init__(self, model_name: str, device: str = "cpu"):
        self.model_name = model_name
        self.device = device
        self.is_loaded = False

    @abstractmethod
    def load(self) -> None:
        pass

    @abstractmethod
    def predict(self, image: Image.Image) -> dict[str, Any]:
        pass

    def ensure_loaded(self) -> None:
        if not self.is_loaded:
            self.load()
            self.is_loaded = True


class HuggingFaceDetector(BaseDetector):
    def __init__(self, model_name: str = "Organika/sdxl-detector", device: str = "cpu"):
        super().__init__(model_name, device)
        self.pipe: Any = None

    def load(self) -> None:
        from transformers import pipeline  # lazy import
        device_id = 0 if self.device == "cuda" else -1
        self.pipe = pipeline(
            "image-classification",
            model=self.model_name,
            device=device_id,
            trust_remote_code=False,
        )

    def predict(self, image: Image.Image) -> dict[str, Any]:
        self.ensure_loaded()
        t0 = time.perf_counter()
        rgb_image = image.convert("RGB")
        
        # Get raw class probabilities from pipeline
        predictions = self.pipe(rgb_image, top_k=None)
        
        # Aggregate probability of being fake
        fake_prob = 0.0
        class_scores = {}
        for item in predictions:
            lbl = str(item["label"])
            score = float(item["score"])
            class_scores[lbl] = score
            if label_is_fake(lbl):
                fake_prob += score
                
        fake_prob = max(0.0, min(1.0, fake_prob))
        verdict = "FAKE" if fake_prob >= 0.5 else "REAL"
        confidence = fake_prob if verdict == "FAKE" else (1.0 - fake_prob)
        elapsed_ms = int((time.perf_counter() - t0) * 1000)

        return {
            "verdict": verdict,
            "fake_probability": round(fake_prob, 4),
            "confidence": round(confidence * 100, 2),
            "model": self.model_name,
            "latency_ms": elapsed_ms,
            "details": class_scores,
        }


class CustomPyTorchDetector(BaseDetector):
    def __init__(self, checkpoint_path: str, device: str = "cpu", img_size: int = 128):
        super().__init__(os.path.basename(checkpoint_path), device)
        self.checkpoint_path = checkpoint_path
        self.img_size = img_size
        self.model: Any = None
        self.transform: Any = None
        self.classes: list[str] = ["FAKE", "REAL"]

    def load(self) -> None:
        import torch
        import torch.nn as nn
        from torchvision import models, transforms

        if not os.path.exists(self.checkpoint_path):
            raise FileNotFoundError(f"Checkpoint file not found: {self.checkpoint_path}")

        ckpt = torch.load(self.checkpoint_path, map_location=self.device, weights_only=False)
        self.classes = ckpt.get("classes", ["FAKE", "REAL"])

        # Construct ResNet-18 architecture with custom FC head
        model = models.resnet18(weights=None)
        in_features = model.fc.in_features
        model.fc = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(in_features, len(self.classes)),
        )

        model.load_state_dict(ckpt["state_dict"])
        model.to(self.device)
        model.eval()
        self.model = model

        # Matching CIFAKE transforms
        mean = [0.485, 0.456, 0.406]
        std = [0.229, 0.224, 0.225]
        self.transform = transforms.Compose([
            transforms.Resize((self.img_size, self.img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean, std),
        ])

    def predict(self, image: Image.Image) -> dict[str, Any]:
        import torch

        self.ensure_loaded()
        t0 = time.perf_counter()
        tensor = self.transform(image.convert("RGB")).unsqueeze(0).to(self.device)

        with torch.no_grad():
            logits = self.model(tensor)
            probs = torch.softmax(logits, dim=1)[0]

        fake_idx = self.classes.index("FAKE") if "FAKE" in self.classes else 0
        fake_prob = float(probs[fake_idx])
        verdict = "FAKE" if fake_prob >= 0.50 else "REAL"
        confidence = fake_prob if verdict == "FAKE" else (1.0 - fake_prob)
        elapsed_ms = int((time.perf_counter() - t0) * 1000)

        return {
            "verdict": verdict,
            "fake_probability": round(fake_prob, 4),
            "confidence": round(confidence * 100, 2),
            "model": self.model_name,
            "latency_ms": elapsed_ms,
            "details": {cls: round(float(probs[i]), 4) for i, cls in enumerate(self.classes)},
        }


class StubDetector(BaseDetector):
    def __init__(self, model_name: str = "stub-detector", device: str = "cpu"):
        super().__init__(model_name, device)

    def load(self) -> None:
        pass

    def predict(self, image: Image.Image) -> dict[str, Any]:
        # Generate predictable mock detection based on image size
        w, h = image.size
        # Pseudo-deterministic score for testing
        fake_prob = round(((w * h) % 100) / 100.0, 4)
        verdict = "FAKE" if fake_prob >= 0.5 else "REAL"
        confidence = fake_prob if verdict == "FAKE" else (1.0 - fake_prob)

        return {
            "verdict": verdict,
            "fake_probability": fake_prob,
            "confidence": round(confidence * 100, 2),
            "model": "stub-detector (mock)",
            "latency_ms": 15,
            "details": {"note": "Running in stub mode. Configure MODEL_BACKEND=hf or custom_pt for production."},
        }


def get_detector(
    backend: str = "hf",
    model_name: str = "Organika/sdxl-detector",
    checkpoint_path: str = "cifake_resnet18.pt",
    device: str = "cpu",
) -> BaseDetector:
    """Factory function for instantiating the requested detector."""
    backend = backend.lower().strip()
    if backend == "stub":
        return StubDetector(device=device)
    elif backend == "custom_pt":
        return CustomPyTorchDetector(checkpoint_path=checkpoint_path, device=device)
    elif backend == "hf":
        return HuggingFaceDetector(model_name=model_name, device=device)
    else:
        raise ValueError(f"Unknown detector backend: {backend}. Expected 'hf', 'custom_pt', or 'stub'.")

