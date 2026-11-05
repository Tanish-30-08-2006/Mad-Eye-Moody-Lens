"""store.py – Local sqlite file for the verdict cache (keyed by media hash) and anonymous feedback; no media bytes, no user identifiers."""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import tempfile
import threading
import time
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Dict, Optional

_DEFAULT_DIR = Path(__file__).resolve().parent.parent / "data"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS verdicts (
    cache_key  TEXT NOT NULL,
    brain_id   TEXT NOT NULL,
    phash      TEXT,
    media_type TEXT NOT NULL,
    payload    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (cache_key, brain_id)
);
CREATE INDEX IF NOT EXISTS idx_verdicts_phash ON verdicts (phash) WHERE phash IS NOT NULL;
CREATE TABLE IF NOT EXISTS feedback (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key     TEXT NOT NULL,
    verdict_label TEXT NOT NULL,
    user_label    TEXT NOT NULL,
    note          TEXT,
    created_at    TEXT NOT NULL
);
"""

# Perceptual hashes within this Hamming distance count as the same picture (recompressed reposts).
PHASH_MAX_DISTANCE = 4
_PHASH_SCAN_LIMIT = 5000


def data_dir() -> Path:
    return Path(os.getenv("MML_EXT_DATA_DIR") or _DEFAULT_DIR)


def phash_of(path: str) -> Optional[str]:
    """Perceptual hash as hex, or None when imagehash/Pillow are not installed (optional dependency)."""
    try:
        import imagehash
        from PIL import Image
    except ImportError:
        return None
    try:
        with Image.open(path) as img:
            return str(imagehash.phash(img))
    except Exception:
        return None


def _hamming(a: str, b: str) -> int:
    try:
        return bin(int(a, 16) ^ int(b, 16)).count("1")
    except ValueError:
        return 64


class ExtStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(_SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path, timeout=10)

    def put_verdict(self, cache_key: str, brain_id: str, media_type: str, payload: Dict[str, Any], phash: Optional[str] = None) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute(
                "INSERT OR REPLACE INTO verdicts (cache_key, brain_id, phash, media_type, payload, created_at) VALUES (?,?,?,?,?,?)",
                (cache_key, brain_id, phash, media_type, json.dumps(payload), datetime.now(UTC).isoformat()),
            )

    def get_verdict(self, cache_key: str, brain_id: str) -> Optional[Dict[str, Any]]:
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT payload, created_at FROM verdicts WHERE cache_key=? AND brain_id=?", (cache_key, brain_id)
            ).fetchone()
        return self._row(row)

    def find_by_phash(self, phash: str, brain_id: str) -> Optional[Dict[str, Any]]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT phash, payload, created_at, cache_key FROM verdicts WHERE brain_id=? AND phash IS NOT NULL "
                "ORDER BY created_at DESC LIMIT ?",
                (brain_id, _PHASH_SCAN_LIMIT),
            ).fetchall()
        for stored, payload, created_at, key in rows:
            if _hamming(stored, phash) <= PHASH_MAX_DISTANCE:
                found = self._row((payload, created_at))
                if found is not None:
                    found["cache_key"] = key
                return found
        return None

    def add_feedback(self, cache_key: str, verdict_label: str, user_label: str, note: Optional[str]) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute(
                "INSERT INTO feedback (cache_key, verdict_label, user_label, note, created_at) VALUES (?,?,?,?,?)",
                (cache_key, verdict_label, user_label, note, datetime.now(UTC).isoformat()),
            )

    def feedback_count(self) -> int:
        with closing(self._connect()) as conn:
            return conn.execute("SELECT COUNT(*) FROM feedback").fetchone()[0]

    @staticmethod
    def _row(row: Optional[tuple]) -> Optional[Dict[str, Any]]:
        if row is None:
            return None
        data = json.loads(row[0])
        data["created_at"] = row[1]
        return data


_stores: Dict[str, ExtStore] = {}
_stores_lock = threading.Lock()


def get_store() -> ExtStore:
    """One store per data directory; the directory is read from MML_EXT_DATA_DIR on each call."""
    path = data_dir() / "extension.sqlite3"
    key = str(path)
    with _stores_lock:
        if key not in _stores:
            _stores[key] = ExtStore(path)
        return _stores[key]


class RetainedMedia:
    """Short-lived copies of scanned media, kept ONLY for brains that can explain a verdict afterwards."""

    def __init__(self, max_items: int = 20, ttl_s: float = 600.0) -> None:
        self.max_items = max_items
        self.ttl_s = ttl_s
        self._items: Dict[str, tuple[str, float]] = {}
        self._dir: Optional[str] = None
        self._lock = threading.Lock()

    def keep(self, job_id: str, source_path: str) -> None:
        with self._lock:
            self._expire()
            if self._dir is None:
                self._dir = tempfile.mkdtemp(prefix="mml-explain-")
            while len(self._items) >= self.max_items:
                self._drop(next(iter(self._items)))
            dest = os.path.join(self._dir, job_id)
            shutil.copyfile(source_path, dest)
            self._items[job_id] = (dest, time.monotonic() + self.ttl_s)

    def get(self, job_id: str) -> Optional[str]:
        with self._lock:
            self._expire()
            item = self._items.get(job_id)
            return item[0] if item else None

    def clear(self) -> None:
        with self._lock:
            for job_id in list(self._items):
                self._drop(job_id)
            if self._dir:
                shutil.rmtree(self._dir, ignore_errors=True)
                self._dir = None

    def _expire(self) -> None:
        now = time.monotonic()
        for job_id, (_, expires) in list(self._items.items()):
            if expires < now:
                self._drop(job_id)

    def _drop(self, job_id: str) -> None:
        path, _ = self._items.pop(job_id)
        try:
            os.remove(path)
        except OSError:
            pass
