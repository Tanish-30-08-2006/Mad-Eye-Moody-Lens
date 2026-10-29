"""
In-memory analysis history store.

Policy
------
- History is kept in memory only (no database) and is cleared on server restart.
- A maximum of 200 recent entries are retained (oldest discarded first).
- No uploaded media bytes or file paths are stored in history.
- Only metadata safe to display in a UI (filename, modality, status, timestamp) is kept.

To persist history across restarts, replace this module with a lightweight
SQLite-backed store and update the import in main.py.
"""
from __future__ import annotations

import uuid
from collections import deque
from datetime import datetime, timezone
from threading import Lock
from typing import Deque, List, Optional

from app.models.schemas import AnalysisHistoryItem, Modality, PredictionStatus

MAX_HISTORY = 200


class HistoryStore:
    def __init__(self, max_size: int = MAX_HISTORY) -> None:
        self._items: Deque[AnalysisHistoryItem] = deque(maxlen=max_size)
        self._lock = Lock()

    def add(
        self,
        *,
        modality: Modality,
        filename: str,
        status: PredictionStatus,
        model_id: str,
        summary: Optional[str] = None,
    ) -> AnalysisHistoryItem:
        item = AnalysisHistoryItem(
            id=uuid.uuid4().hex,
            modality=modality,
            filename=filename,
            timestamp=datetime.now(timezone.utc).isoformat(),
            status=status,
            model_id=model_id,
            summary=summary,
        )
        with self._lock:
            self._items.appendleft(item)
        return item

    def list(self, limit: int = 20) -> List[AnalysisHistoryItem]:
        with self._lock:
            return list(self._items)[:limit]

    def clear(self) -> None:
        with self._lock:
            self._items.clear()

    @property
    def total(self) -> int:
        return len(self._items)


history_store = HistoryStore()
