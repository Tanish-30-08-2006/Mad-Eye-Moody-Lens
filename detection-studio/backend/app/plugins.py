from __future__ import annotations

import hashlib
import importlib.util
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any

import yaml


class ModelNotFound(LookupError):
    pass


class ModelUnavailable(RuntimeError):
    pass


@dataclass
class ModelPlugin:
    """Resolved metadata for one self-contained folder under /models."""

    folder: Path
    manifest: dict[str, Any]
    artifacts: dict[str, Path]
    status: str
    message: str | None
    fingerprint: str

    @property
    def id(self) -> str:
        return str(self.manifest["id"])

    @property
    def adapter_path(self) -> Path:
        entry = str(self.manifest.get("adapter", "adapter.py:Detector")).split(":", 1)[0]
        return (self.folder / entry).resolve()

    @property
    def selectable(self) -> bool:
        return self.status == "ready"

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.manifest.get("name", self.id),
            "short_name": self.manifest.get("short_name", self.manifest.get("name", self.id)),
            "task": self.manifest.get("task", "unknown"),
            "description": self.manifest.get("description", ""),
            "version": str(self.manifest.get("version", "1.0")),
            "status": self.status,
            "selectable": self.selectable,
            "setup_message": self.message,
            "score_semantics": self.manifest.get("score_semantics", "Model-specific score; not necessarily calibrated."),
            "positive_label": self.manifest.get("positive_label", "Likely fake"),
            "negative_label": self.manifest.get("negative_label", "Likely real"),
            "paper_title": self.manifest.get("paper_title"),
            "paper_url": self.manifest.get("paper_url"),
            "code_url": self.manifest.get("code_url"),
            "weights_url": self.manifest.get("weights_url"),
            "license_note": self.manifest.get("license_note"),
        }


class PluginRegistry:
    """Auto-discovers models. No central Python factory or master catalogue to edit."""

    ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]*$")

    def __init__(self, models_dir: Path):
        self.models_dir = models_dir.resolve()

    def list(self) -> list[ModelPlugin]:
        self.models_dir.mkdir(parents=True, exist_ok=True)
        plugins: list[ModelPlugin] = []
        for folder in sorted(self.models_dir.iterdir(), key=lambda p: p.name.lower()):
            if not folder.is_dir() or folder.name.startswith(("_", ".")):
                continue
            manifest_path = folder / "model.yaml"
            if not manifest_path.is_file():
                continue
            try:
                plugins.append(self._read(folder, manifest_path))
            except Exception as exc:
                plugins.append(self._invalid(folder, str(exc)))
        counts = Counter(plugin.id for plugin in plugins)
        for plugin in plugins:
            if counts[plugin.id] > 1:
                plugin.status = "invalid"
                plugin.message = f"Duplicate model id '{plugin.id}'. Model IDs must be unique."
        return plugins

    def _read(self, folder: Path, manifest_path: Path) -> ModelPlugin:
        data = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
        if not isinstance(data, dict):
            raise ValueError("model.yaml must contain a YAML object")
        model_id = str(data.get("id", ""))
        if not self.ID_PATTERN.fullmatch(model_id):
            raise ValueError("id must use lowercase letters, numbers, hyphens or underscores")
        if model_id != folder.name:
            raise ValueError("model folder name must exactly match the manifest id")

        artifact_config = data.get("artifacts", {}) or {}
        if not isinstance(artifact_config, dict):
            raise ValueError("artifacts must be a mapping of names to relative paths")
        artifacts = {str(key): (folder / str(value)).expanduser().resolve() for key, value in artifact_config.items()}

        adapter_spec = str(data.get("adapter", "adapter.py:Detector"))
        if ":" not in adapter_spec:
            raise ValueError("adapter must use the format 'adapter.py:DetectorClass'")
        adapter_file, _class_name = adapter_spec.split(":", 1)
        adapter_path = (folder / adapter_file).resolve()
        if folder.resolve() not in adapter_path.parents:
            raise ValueError("adapter path must stay inside its model folder")

        enabled = bool(data.get("enabled", True))
        implemented = bool(data.get("implemented", True))
        required = data.get("required_artifacts", list(artifacts)) or []
        missing = [str(name) for name in required if name not in artifacts or not artifacts[str(name)].is_file() and not artifacts[str(name)].is_dir()]
        if not enabled:
            status, message = "disabled", "Disabled in model.yaml. Set enabled: true to make this model selectable."
        elif not implemented:
            status, message = "planned", "This model is documented but its adapter has not been implemented."
        elif not adapter_path.is_file():
            status, message = "setup_required", f"Adapter file not found: {adapter_file}"
        elif missing:
            status, message = "setup_required", "Missing required files: " + ", ".join(missing)
        else:
            status, message = "ready", None

        fingerprint_parts = [manifest_path.read_bytes(), adapter_path.stat().st_mtime_ns.to_bytes(8, "little") if adapter_path.exists() else b"missing"]
        for name in sorted(artifacts):
            path = artifacts[name]
            fingerprint_parts.append(name.encode())
            if path.exists():
                stat = path.stat()
                fingerprint_parts.extend([str(stat.st_size).encode(), str(stat.st_mtime_ns).encode()])
            else:
                fingerprint_parts.append(b"missing")
        fingerprint = hashlib.sha256(b"|".join(fingerprint_parts)).hexdigest()
        return ModelPlugin(folder, data, artifacts, status, message, fingerprint)

    def _invalid(self, folder: Path, message: str) -> ModelPlugin:
        data = {"id": folder.name, "name": folder.name, "enabled": False}
        return ModelPlugin(folder, data, {}, "invalid", f"Invalid model plugin: {message}", "invalid")

    def get(self, model_id: str) -> ModelPlugin:
        plugin = next((item for item in self.list() if item.id == model_id), None)
        if plugin is None:
            raise ModelNotFound(f"Unknown model '{model_id}'.")
        if not plugin.selectable:
            raise ModelUnavailable(plugin.message or f"Model '{model_id}' is not ready.")
        return plugin


def create_adapter(plugin: ModelPlugin) -> tuple[Any, ModuleType, str]:
    """Import a plugin adapter from its folder without adding it to a central factory."""
    module_file, class_name = str(plugin.manifest.get("adapter", "adapter.py:Detector")).split(":", 1)
    adapter_file = (plugin.folder / module_file).resolve()
    module_name = f"detector_plugin_{plugin.id.replace('-', '_')}_{plugin.fingerprint[:10]}"
    spec = importlib.util.spec_from_file_location(module_name, adapter_file)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import adapter for {plugin.id}.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
        adapter_class = getattr(module, class_name)
        return adapter_class(plugin), module, module_name
    except Exception:
        sys.modules.pop(module_name, None)
        raise
