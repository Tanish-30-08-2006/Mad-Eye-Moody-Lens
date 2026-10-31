# Model plugin guide

A model is a folder under `models/` containing at least:

```text
models/my-detector/
├── model.yaml
├── adapter.py
├── requirements.txt       # optional
└── weights/
    └── checkpoint.pth
```

The core discovers `model.yaml` automatically. The manifest's `adapter` value uses `relative_file.py:ClassName`. Artifact paths are relative to the plugin folder. Use `../_shared/...` for common assets.

The class must implement:

```python
class Detector:
    def __init__(self, plugin): ...
    def load(self) -> None: ...
    def predict(self, image: PIL.Image.Image) -> dict: ...
    def unload(self) -> None: ...
```

`plugin.manifest` contains YAML metadata, `plugin.folder` is the model folder, and `plugin.artifacts` maps artifact names to resolved `Path` objects.

`predict` returns:

```python
{
    "score": 0.73,                         # normalized to [0, 1]
    "predicted_label": "Likely AI-generated",
    "score_semantics": "Raw sigmoid; not calibrated",
    "inference_time_ms": 420.0,             # optional; manager measures if omitted
    "metadata": {"device": "cpu"}          # optional
}
```

Do not assume a score is a calibrated probability. Each plugin must state its score semantics. The common interface intentionally keeps only four methods; preprocessing, model architecture, TTA, and output mapping belong inside the adapter.

For models with conflicting dependencies or generic upstream imports (e.g. multiple repositories each exposing a top-level `models` package), isolate them in separate processes or virtual environments before using them together. Do not force incompatible research environments into a single Python environment.
