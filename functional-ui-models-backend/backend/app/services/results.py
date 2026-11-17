"""Stored results and Grad-CAM explanations (design doc Sections 4 and 7).

* ``analyses`` rows hold the full ``AnalysisResult`` minus media, for 7 days.
* Heatmap PNGs + ``meta.json`` live in storage under ``explanations/<id>/``
  and share the analysis's expiry.
"""

from __future__ import annotations

import base64
import json
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select

from app.core.config import settings
from app.core.errors import NoExplanation, NotFound
from app.core.storage import explanation_prefix, get_storage
from app.db.models import Analysis
from app.db.session import session_scope
from app.schemas import AnalysisResult, Explanation, FaceHeatmap
from app.services.pipelines import PipelineOutput


def _uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(hex=value)
    except ValueError as exc:
        raise NotFound("Analysis") from exc


def save_output(out: PipelineOutput) -> AnalysisResult:
    """Persist heatmaps first, then the row (so a visible row never lacks its files).

    Idempotent: a retried task with the same ``analysis_id`` overwrites both.
    """
    r = out.result
    storage = get_storage()
    if out.heatmaps:
        prefix = explanation_prefix(r.analysis_id)
        meta = []
        for n, h in enumerate(out.heatmaps):
            storage.put_bytes(f"{prefix}{n}.png", h.png)
            meta.append(
                {
                    "source": h.source,
                    "time_s": h.time_s,
                    "face_index": h.face_index,
                    "box": list(h.box),
                    "fake_probability": h.fake_probability,
                    "file": f"{n}.png",
                }
            )
        storage.put_bytes(f"{prefix}meta.json", json.dumps(meta).encode())

    now = datetime.now(UTC)
    with session_scope() as s:
        row = s.get(Analysis, _uuid(r.analysis_id)) or Analysis(id=_uuid(r.analysis_id))
        row.media_type = r.media_type
        row.verdict = r.verdict
        row.fake_probability = r.fake_probability
        row.scores = [x.model_dump() for x in r.scores]
        row.segments = [x.model_dump() for x in r.segments]
        row.details = r.details
        row.model_versions = r.model_versions
        row.explanation_count = len(out.heatmaps)
        row.processing_ms = r.processing_ms
        row.created_at = row.created_at or now
        row.expires_at = now + timedelta(days=settings.result_retention_days)
        s.add(row)
    return r


def _to_result(row: Analysis) -> AnalysisResult:
    return AnalysisResult(
        analysis_id=row.id.hex,
        media_type=row.media_type,  # type: ignore[arg-type]
        verdict=row.verdict,  # type: ignore[arg-type]
        fake_probability=row.fake_probability,
        scores=row.scores,
        segments=row.segments,
        details=row.details,
        processing_ms=row.processing_ms,
        model_versions=row.model_versions,
        explanation_available=row.explanation_count > 0,
    )


def _live_row(analysis_id: str) -> Analysis:
    with session_scope() as s:
        row = s.get(Analysis, _uuid(analysis_id))
        if row is None or _aware(row.expires_at) <= datetime.now(UTC):
            raise NotFound("Analysis")
        s.expunge(row)
        return row


def _aware(dt: datetime) -> datetime:
    # SQLite returns naive datetimes; PostgreSQL returns aware ones.
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def get_result(analysis_id: str) -> AnalysisResult:
    return _to_result(_live_row(analysis_id))


def get_explanation(analysis_id: str, model_name: str) -> Explanation:
    row = _live_row(analysis_id)
    if row.explanation_count == 0:
        raise NoExplanation()
    storage = get_storage()
    prefix = explanation_prefix(analysis_id)
    try:
        meta = json.loads(storage.get_bytes(f"{prefix}meta.json"))
    except FileNotFoundError as exc:
        raise NoExplanation() from exc
    items = [
        FaceHeatmap(
            source=m["source"],
            time_s=m["time_s"],
            face_index=m["face_index"],
            box=tuple(m["box"]),
            fake_probability=m["fake_probability"],
            heatmap_png=base64.b64encode(storage.get_bytes(prefix + m["file"])).decode("ascii"),
        )
        for m in meta
    ]
    return Explanation(analysis_id=analysis_id, model=model_name, items=items)


def purge_expired() -> int:
    """Delete expired analyses and their explanation files; returns rows removed."""
    now = datetime.now(UTC)
    storage = get_storage()
    with session_scope() as s:
        ids = [r for (r,) in s.execute(select(Analysis.id).where(Analysis.expires_at <= now))]
        for aid in ids:
            storage.delete_prefix(explanation_prefix(aid.hex))
        if ids:
            s.execute(delete(Analysis).where(Analysis.id.in_(ids)))
    return len(ids)
