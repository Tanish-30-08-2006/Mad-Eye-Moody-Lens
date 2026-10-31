from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import MODELS_DIR  # noqa: E402
from app.plugins import PluginRegistry  # noqa: E402


def main() -> int:
    print(f"Python: {sys.version.split()[0]}")
    print(f"Model directory: {MODELS_DIR}")
    registry = PluginRegistry(MODELS_DIR)
    plugins = registry.list()
    if not plugins:
        print("No model folders found under models/.")
    for plugin in plugins:
        print(f"- {plugin.id}: {plugin.status}")
        if plugin.message:
            print(f"  {plugin.message}")
    try:
        import torch
        import torchvision
        print(f"PyTorch: {torch.__version__}")
        print(f"torchvision: {torchvision.__version__}")
        print(f"CUDA available: {torch.cuda.is_available()}")
        print(f"CPU threads: {torch.get_num_threads()}")
    except ImportError as exc:
        print(f"PyTorch stack not installed: {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
