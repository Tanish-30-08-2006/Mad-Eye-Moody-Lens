"""
Model Registry
==============
Central registry for all deepfake detection model adapters.

Responsibilities
----------------
* Register adapter instances under a stable model_id.
* Report status without triggering model loading.
* Provide a single point for retrieving adapters for inference.
* Keep registration separate from weight loading so the API starts
  even when checkpoints are absent.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

from app.adapters.base import BaseModelAdapter
from app.models.schemas import ModelInfo, ModelListResponse, ModelStatus

logger = logging.getLogger(__name__)


class ModelRegistry:
    def __init__(self) -> None:
        self._adapters: Dict[str, BaseModelAdapter] = {}

    # ── Registration ──────────────────────────────────────────────────────────

    def register(self, adapter: BaseModelAdapter) -> None:
        """Register an adapter. Can be called multiple times to replace."""
        mid = adapter.model_id
        self._adapters[mid] = adapter
        logger.info("Registered model adapter: %s", mid)

    # ── Retrieval ─────────────────────────────────────────────────────────────

    def get(self, model_id: str) -> Optional[BaseModelAdapter]:
        return self._adapters.get(model_id)

    def require(self, model_id: str) -> BaseModelAdapter:
        """Return adapter or raise KeyError if unknown."""
        adapter = self._adapters.get(model_id)
        if adapter is None:
            raise KeyError(f"Unknown model_id: '{model_id}'")
        return adapter

    def all_adapters(self) -> List[BaseModelAdapter]:
        return list(self._adapters.values())

    # ── Status helpers ────────────────────────────────────────────────────────

    def model_info_list(self) -> List[ModelInfo]:
        return [a.get_info() for a in self._adapters.values()]

    def list_response(self) -> ModelListResponse:
        infos = self.model_info_list()
        configured = sum(1 for i in infos if i.status == ModelStatus.READY)
        unavailable = len(infos) - configured
        return ModelListResponse(
            models=infos,
            configured_count=configured,
            unavailable_count=unavailable,
        )

    def configured_count(self) -> int:
        return sum(
            1
            for a in self._adapters.values()
            if a.get_info().status == ModelStatus.READY
        )

    def unavailable_count(self) -> int:
        return len(self._adapters) - self.configured_count()


# Singleton – imported by the FastAPI app and by routes
registry = ModelRegistry()
