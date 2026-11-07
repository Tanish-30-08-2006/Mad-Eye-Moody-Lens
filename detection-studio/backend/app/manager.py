from __future__ import annotations

import logging
import sys
import threading
from time import perf_counter
from typing import Any

from PIL import Image

from app.plugins import ModelPlugin, PluginRegistry, create_adapter

log = logging.getLogger(__name__)


class InferenceManager:
    """Loads one selected detector, reuses it, and unloads it when switching models."""

    def __init__(self, registry: PluginRegistry):
        self.registry = registry
        self._lock = threading.RLock()
        self._plugin: ModelPlugin | None = None
        self._adapter: Any = None
        self._module_name: str | None = None
        self._loaded = False
        self._load_ms = 0.0

    def predict(self, model_id: str, image: Image.Image) -> dict[str, Any]:
        with self._lock:
            try:
                plugin = self.registry.get(model_id)
            except Exception:
                if self._plugin and self._plugin.id == model_id:
                    self._unload()
                raise

            if self._plugin is None or self._plugin.id != plugin.id or self._plugin.fingerprint != plugin.fingerprint:
                self._unload()
                adapter, _module, module_name = create_adapter(plugin)
                self._plugin = plugin
                self._adapter = adapter
                self._module_name = module_name

            load_ms = 0.0
            if not self._loaded:
                started = perf_counter()
                try:
                    self._adapter.load()
                except Exception:
                    self._unload()
                    raise
                self._load_ms = load_ms = (perf_counter() - started) * 1000
                self._loaded = True

            started = perf_counter()
            try:
                raw = self._adapter.predict(image)
                measured_ms = (perf_counter() - started) * 1000
                score = float(raw["score"])
                if not 0.0 <= score <= 1.0:
                    raise ValueError(f"Adapter '{model_id}' returned score {score}; expected a value from 0 to 1.")
            except Exception:
                self._unload()
                raise

            manifest = plugin.manifest
            inference_ms = float(raw.get("inference_time_ms") or measured_ms)
            return {
                "model_id": plugin.id,
                "model_name": manifest.get("name", plugin.id),
                "model_version": str(manifest.get("version", "1.0")),
                "task": manifest.get("task", "unknown"),
                "predicted_label": str(raw.get("predicted_label", manifest.get("positive_label", "Likely fake") if score >= 0.5 else manifest.get("negative_label", "Likely real"))),
                "score": score,
                "score_semantics": raw.get("score_semantics") or manifest.get("score_semantics", "Model-specific score; not necessarily calibrated."),
                "model_load_time_ms": load_ms,
                "inference_time_ms": inference_ms,
                "total_time_ms": load_ms + inference_ms,
                "disclaimer": "Research-model output, not proof of authenticity. Scores are model-specific and may not be calibrated. Evaluate on data representative of your intended use.",
                "metadata": raw.get("metadata", {}),
            }

    def unload(self) -> None:
        with self._lock:
            self._unload()

    def _unload(self) -> None:
        if self._adapter is not None:
            try:
                self._adapter.unload()
            except Exception:
                log.exception("Error unloading model %s", self._plugin.id if self._plugin else "unknown")
        self._adapter = None
        self._plugin = None
        self._loaded = False
        self._load_ms = 0.0
        if self._module_name:
            sys.modules.pop(self._module_name, None)
        self._module_name = None
