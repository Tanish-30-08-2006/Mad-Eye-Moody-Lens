"""Synchronous SQLAlchemy engine/session.

Sync is deliberate: the API calls the database from FastAPI's thread pool
(plain ``def`` helpers / ``run_in_threadpool``) and Celery workers are
synchronous, so one code path serves both.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

_engine: Engine | None = None
_factory: sessionmaker[Session] | None = None


def ensure_sqlite_dir(url: str) -> None:
    """Local dev uses ``sqlite:///./data/mml.db``; SQLite cannot create the folder itself."""
    if url.startswith("sqlite:///") and not url.startswith("sqlite:///:memory:"):
        folder = os.path.dirname(url.removeprefix("sqlite:///"))
        if folder:
            os.makedirs(folder, exist_ok=True)


def get_engine() -> Engine:
    global _engine, _factory
    if _engine is None:
        ensure_sqlite_dir(settings.database_url)
        kwargs: dict = {"pool_pre_ping": True}
        if settings.database_url.startswith("postgresql"):
            # Small pool: the laptop runs one API process and two worker processes.
            kwargs.update(pool_size=5, max_overflow=5, pool_recycle=1800)
        _engine = create_engine(settings.database_url, **kwargs)
        _factory = sessionmaker(_engine, expire_on_commit=False)
    return _engine


def set_engine(engine: Engine | None) -> None:
    """Test hook (in-memory SQLite)."""
    global _engine, _factory
    _engine = engine
    _factory = sessionmaker(engine, expire_on_commit=False) if engine is not None else None


@contextmanager
def session_scope() -> Iterator[Session]:
    """Commit on success, roll back on error, always close."""
    get_engine()
    assert _factory is not None
    session = _factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def db_healthy() -> bool:
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001
        return False
