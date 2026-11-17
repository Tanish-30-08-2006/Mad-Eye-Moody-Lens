"""PostgreSQL schema (design doc Section 7).

Only results and job state are stored: never media, file names, EXIF or IPs.
JSON columns use JSONB on PostgreSQL and plain JSON elsewhere (SQLite in tests).
Schema changes go through Alembic (``migrations/``).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, DateTime, Float, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

JsonType = JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    pass


class Analysis(Base):
    __tablename__ = "analyses"
    __table_args__ = (
        CheckConstraint("media_type IN ('image','audio','video')", name="ck_analyses_media_type"),
        CheckConstraint("verdict IN ('likely_real','uncertain','likely_fake')", name="ck_analyses_verdict"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    media_type: Mapped[str] = mapped_column(String(8))
    verdict: Mapped[str] = mapped_column(String(16))
    fake_probability: Mapped[float] = mapped_column(Float)
    scores: Mapped[list] = mapped_column(JsonType)
    segments: Mapped[list] = mapped_column(JsonType, default=list)
    details: Mapped[dict] = mapped_column(JsonType, default=dict)
    model_versions: Mapped[dict] = mapped_column(JsonType, default=dict)
    explanation_count: Mapped[int] = mapped_column(Integer, default=0)
    processing_ms: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (CheckConstraint("status IN ('queued','running','done','failed')", name="ck_jobs_status"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    status: Mapped[str] = mapped_column(String(8), default="queued")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    stage: Mapped[str | None] = mapped_column(String(12), default="queued")
    # Pre-allocated at enqueue so a retried task writes the same analyses row
    # (idempotent). No foreign key: the analysis row only exists once the job is done.
    analysis_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)  # user-facing message only
    celery_task_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
