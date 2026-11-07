from __future__ import annotations

import copy
import importlib
import logging
import sys
import time
from pathlib import Path
from typing import Any

from PIL import Image

log = logging.getLogger(__name__)


class Detector:
    """IAPL adapter. It follows the upstream GenImage test-time adaptation path."""

    def __init__(self, plugin):
        self.plugin = plugin
        self.settings = plugin.manifest.get("settings", {})
        self.paths = plugin.artifacts
        self.torch = None
        self.model = None
        self.optimizer = None
        self.device = None
        self.augmenter = None
        self.initial_ctx = None
        self.initial_optimizer_state = None
        self.imported_upstream_modules: set[str] = set()
        self.added_sys_path = False
        self.loaded = False

    def load(self) -> None:
        if self.loaded:
            return

        import torch
        import torch.nn.functional as F
        import torchvision.transforms as T

        repo = self.paths["repository"].resolve()
        if str(repo) not in sys.path:
            sys.path.insert(0, str(repo))
            self.added_sys_path = True

        # Some research repositories use generic top-level package names such as
        # `models`. Refuse an ambiguous import rather than silently loading another
        # detector's code from the same Python process.
        for package_name in ("models", "augmix"):
            existing = sys.modules.get(package_name)
            existing_file = str(getattr(existing, "__file__", "")) if existing else ""
            if existing_file and not existing_file.lower().startswith(str(repo).lower()):
                raise RuntimeError(
                    f"A different Python package named '{package_name}' is already loaded. "
                    "Run this detector in its own environment/process to avoid research-code collisions."
                )
        if not (repo / "main.py").is_file() or not (repo / "models" / "clip_models.py").is_file():
            raise FileNotFoundError(f"The official IAPL source is incomplete: {repo}")

        before = set(sys.modules)
        try:
            # Imports are delayed so listing models and starting the API do not import torch.
            clip_models = importlib.import_module("models.clip_models")
            model_package = importlib.import_module("models")
            AugMixAugmenter = importlib.import_module("augmix").AugMixAugmenter

            device_name = str(self.settings.get("device", "auto")).lower()
            if device_name == "auto":
                device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            elif device_name.startswith("cuda") and not torch.cuda.is_available():
                raise RuntimeError("This model requests CUDA, but the installed PyTorch build cannot access CUDA. Set device: cpu in model.yaml.")
            else:
                device = torch.device(device_name)

            if device.type == "cpu":
                torch.set_num_threads(int(self.settings.get("cpu_threads", 6)))

            clip_path = self.paths["clip"]
            checkpoint_path = self.paths["checkpoint"]

            # Upstream IAPL currently hard-codes a CLIP path. Override the loader
            # function in memory rather than editing files inside third_party/IAPL.
            def load_clip_from_configured_path(_unused, n_ctx, adapter_vit, adapter_text, prompt_depth, gate):
                try:
                    clip_base = torch.jit.load(str(clip_path), map_location="cpu").eval()
                    source_state = clip_base.state_dict()
                except RuntimeError:
                    try:
                        source_state = torch.load(str(clip_path), map_location="cpu", weights_only=False)
                    except TypeError:
                        source_state = torch.load(str(clip_path), map_location="cpu")
                design = {
                    "trainer": "MaPLe",
                    "vision_depth": 0,
                    "language_depth": 0,
                    "vision_ctx": 0,
                    "language_ctx": 0,
                    "maple_length": n_ctx,
                    "vit_adapter_list": adapter_vit,
                    "text_adapter_list": adapter_text,
                    "prompt_depth": prompt_depth,
                    "gate": gate,
                }
                return clip_models.clip.build_model(source_state, design).float()

            clip_models.load_clip_to_cpu = load_clip_from_configured_path

            from argparse import Namespace
            args = Namespace(
                backbone="CLIP:ViT-L/14",
                n_ctx=2,
                prompt_depth=9,
                image_size=int(self.settings.get("image_size", 224)),
                vision_width=1024,
                vit_adapter_list=[3, 7, 11, 15, 19, 23],
                text_adapter_list=[],
                gate=True,
                condition=True,
                tta=True,
                loss_adapter=1.0,
                loss_contrast=1.0,
                loss_condition=1.0,
                use_contrast=False,
                smooth=True,
            )

            model = model_package.build_model(args).to(device)
            try:
                checkpoint = torch.load(str(checkpoint_path), map_location="cpu", weights_only=False)
            except TypeError:  # PyTorch versions before the weights_only argument.
                checkpoint = torch.load(str(checkpoint_path), map_location="cpu")
            state = checkpoint.get("model", checkpoint)
            model.load_state_dict(state, strict=True)
            model.freeze_tta()
            model.eval()

            trainable = [parameter for parameter in model.parameters() if parameter.requires_grad]
            if not trainable:
                raise RuntimeError("IAPL loaded, but no TTA parameters are trainable. Check the upstream code/checkpoint pairing.")
            optimizer = torch.optim.AdamW(trainable, lr=float(self.settings.get("learning_rate", 0.005)))

            resize = int(self.settings.get("resize_size", 256))
            image_size = int(self.settings.get("image_size", 224))
            preprocess = T.Compose([
                T.ToTensor(),
                T.Normalize(mean=[0.481, 0.458, 0.408], std=[0.269, 0.261, 0.276]),
            ])
            augmenter = AugMixAugmenter(
                base_transform=T.Compose([T.Resize((resize, resize)), T.CenterCrop(image_size)]),
                img_resolution=resize,
                crop_resolution=image_size,
                preprocess=preprocess,
                n_views=int(self.settings.get("n_views", 31)),
                augmix=False,
                dataset="GenImage",
            )

            self.torch, self.F = torch, F
            self.device, self.model, self.optimizer = device, model, optimizer
            self.initial_ctx = model.prompt_learner.ctx.detach().clone()
            self.initial_optimizer_state = copy.deepcopy(optimizer.state_dict())
            self.augmenter = augmenter
            self.loaded = True
        finally:
            # Record only upstream modules imported by this plugin. They are removed
            # on unload to reduce collisions with other research repos using names
            # such as `models` or `utils`.
            repo_prefix = str(repo.resolve()).lower()
            self.imported_upstream_modules = {
                name for name, module in sys.modules.items()
                if str(getattr(module, "__file__", "")).lower().startswith(repo_prefix)
            }

    def _select_views(self, logits):
        torch, F = self.torch, self.F
        probs = torch.sigmoid(logits.reshape(-1))
        confidence = F.softmax(torch.abs(probs - 0.5) * 2.0, dim=0)
        fraction = float(self.settings.get("selection_fraction", 0.20))
        count = max(1, min(len(probs), int(len(probs) * fraction)))
        selected = torch.topk(confidence, k=count, dim=0).indices
        mean = probs[selected].mean()
        loss = -(mean * torch.log(mean + 1e-8) + (1 - mean) * torch.log(1 - mean + 1e-8))
        return loss, selected

    def predict(self, image: Image.Image) -> dict[str, Any]:
        if not self.loaded:
            self.load()
        torch = self.torch
        start = time.perf_counter()
        views = torch.stack(self.augmenter(image.convert("RGB"))).to(self.device)

        # Reset TTA state for every uploaded image; previous requests must not leak into this one.
        with torch.no_grad():
            self.model.prompt_learner.ctx.copy_(self.initial_ctx)
        self.optimizer.load_state_dict(copy.deepcopy(self.initial_optimizer_state))

        self.model.train()
        for _ in range(int(self.settings.get("tta_steps", 2))):
            logits, _features, _conditional = self.model(views)
            loss, _selected = self._select_views(logits)
            self.optimizer.zero_grad(set_to_none=True)
            loss.backward()
            self.optimizer.step()

        self.model.eval()
        with torch.no_grad():
            logits = self.model(views)
            _loss, selected = self._select_views(logits)
            scores = torch.sigmoid(self.model(views[selected]).reshape(-1))
            score = float(scores[torch.argmax(torch.abs(scores - 0.5))].item())

        elapsed = (time.perf_counter() - start) * 1000
        fake_label = self.plugin.manifest.get("positive_label", "Likely AI-generated")
        real_label = self.plugin.manifest.get("negative_label", "Likely real")
        return {
            "score": min(1.0, max(0.0, score)),
            "predicted_label": fake_label if score >= 0.5 else real_label,
            "score_semantics": self.plugin.manifest.get("score_semantics"),
            "inference_time_ms": elapsed,
            "metadata": {
                "device": str(self.device),
                "views": int(views.shape[0]),
                "tta_steps": int(self.settings.get("tta_steps", 2)),
                "score_threshold": 0.5,
            },
        }

    def unload(self) -> None:
        self.model = self.optimizer = self.augmenter = None
        self.initial_ctx = self.initial_optimizer_state = None
        if self.torch is not None and self.torch.cuda.is_available():
            self.torch.cuda.empty_cache()
        for name in sorted(self.imported_upstream_modules, key=len, reverse=True):
            sys.modules.pop(name, None)
        self.imported_upstream_modules.clear()
        if self.added_sys_path:
            repo = str(self.paths["repository"].resolve())
            if repo in sys.path:
                sys.path.remove(repo)
        self.loaded = False
