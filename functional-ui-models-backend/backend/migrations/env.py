"""Alembic environment: runs migrations against MML_DATABASE_URL.

Run before every API release:  ``alembic upgrade head``  (design doc Section 11).
Migrations stay backward-compatible for one release so a rollback is just the
previous image tag.
"""

from __future__ import annotations

from alembic import context
from sqlalchemy import create_engine

from app.core.config import settings
from app.db.models import Base
from app.db.session import ensure_sqlite_dir

target_metadata = Base.metadata


def run_offline() -> None:
    context.configure(url=settings.database_url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_online() -> None:
    ensure_sqlite_dir(settings.database_url)  # local dev: create ./data before SQLite opens it
    engine = create_engine(settings.database_url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_offline()
else:
    run_online()
