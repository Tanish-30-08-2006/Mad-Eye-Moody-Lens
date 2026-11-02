"""Initial schema: analyses and jobs (design doc Section 7).

Revision ID: 0001_initial
Revises:
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "analyses",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("media_type", sa.String(8), nullable=False),
        sa.Column("verdict", sa.String(16), nullable=False),
        sa.Column("fake_probability", sa.Float(), nullable=False),
        sa.Column("scores", JSON, nullable=False),
        sa.Column("segments", JSON, nullable=False),
        sa.Column("details", JSON, nullable=False),
        sa.Column("model_versions", JSON, nullable=False),
        sa.Column("explanation_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processing_ms", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("media_type IN ('image','audio','video')", name="ck_analyses_media_type"),
        sa.CheckConstraint("verdict IN ('likely_real','uncertain','likely_fake')", name="ck_analyses_verdict"),
    )
    op.create_index("ix_analyses_created_at", "analyses", ["created_at"])
    op.create_index("ix_analyses_expires_at", "analyses", ["expires_at"])

    op.create_table(
        "jobs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("status", sa.String(8), nullable=False),
        sa.Column("progress", sa.Float(), nullable=False, server_default="0"),
        sa.Column("stage", sa.String(12), nullable=True),
        sa.Column("analysis_id", sa.Uuid(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("celery_task_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('queued','running','done','failed')", name="ck_jobs_status"),
    )
    op.create_index("ix_jobs_created_at", "jobs", ["created_at"])
    op.create_index("ix_jobs_expires_at", "jobs", ["expires_at"])


def downgrade() -> None:
    op.drop_table("jobs")
    op.drop_table("analyses")
