"""History route."""
from __future__ import annotations

from fastapi import APIRouter, Query

from app.models.schemas import HistoryResponse
from app.services.history import history_store

router = APIRouter(prefix="/api", tags=["history"])


@router.get("/history", response_model=HistoryResponse)
async def get_history(limit: int = Query(default=20, le=100)):
    items = history_store.list(limit=limit)
    return HistoryResponse(items=items, total=history_store.total)
