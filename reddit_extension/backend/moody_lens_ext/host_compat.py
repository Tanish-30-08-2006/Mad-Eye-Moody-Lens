"""host_compat.py – Imports from the host backend (`app.*`) with small standalone fallbacks, so the extension API also runs (with the stub brain) without the host."""

from __future__ import annotations

import logging
import os
import tempfile
from types import SimpleNamespace
from typing import Any

try:
    from app.core.config import settings
    from app.core.errors import AnalysisError, NotFound
    from app.core.logging import get_logger
    from app.core.uploads import save_upload

    HOST_IMPORTABLE = True
except ImportError:
    HOST_IMPORTABLE = False

    class AnalysisError(Exception):  # type: ignore[no-redef]
        def __init__(self, message: str, status_code: int = 400) -> None:
            super().__init__(message)
            self.message = message
            self.status_code = status_code

    class NotFound(Exception):  # type: ignore[no-redef]
        pass

    class _StandaloneSettings:
        """Env-driven stand-in for the host settings the extension API reads."""

        _DEFAULT_MB = {"image": 20, "video": 100, "audio": 50}

        @property
        def allow_mock(self) -> bool:
            return os.getenv("MML_ALLOW_MOCK", "").strip().lower() in ("1", "true", "yes", "on")

        def max_mb(self, kind: str) -> int:
            return int(os.getenv(f"MML_MAX_{kind.upper()}_MB", str(self._DEFAULT_MB.get(kind, 20))))

    settings = _StandaloneSettings()  # type: ignore[assignment]

    def get_logger(name: str) -> logging.Logger:  # type: ignore[no-redef]
        return logging.getLogger(name)

    # Magic-byte checks per media kind; the host's own save_upload is stricter and wins when present.
    def _looks_like(kind: str, head: bytes) -> bool:
        if kind == "image":
            return head[:4] == b"\x89PNG" or head[:3] == b"\xff\xd8\xff" or head[:4] == b"GIF8" or (head[:4] == b"RIFF" and head[8:12] == b"WEBP")
        if kind == "video":
            return head[4:8] == b"ftyp" or head[:4] == b"\x1a\x45\xdf\xa3"
        return (
            head[:3] == b"ID3"
            or head[:4] in (b"fLaC", b"OggS")
            or (head[:4] == b"RIFF" and head[8:12] == b"WAVE")
            or head[4:8] == b"ftyp"
            or head[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2")
        )

    async def save_upload(upload: Any, kind: str) -> Any:  # type: ignore[no-redef]
        limit = settings.max_mb(kind) * 1024 * 1024
        fd, path = tempfile.mkstemp(prefix="mml-ext-up-", suffix=".bin")
        total = 0
        head = b""
        try:
            with os.fdopen(fd, "wb") as out:
                while chunk := await upload.read(1024 * 1024):
                    if not head:
                        head = chunk[:16]
                    total += len(chunk)
                    if total > limit:
                        raise AnalysisError(f"File is larger than {settings.max_mb(kind)} MB.", 413)
                    out.write(chunk)
            if total == 0:
                raise AnalysisError("Uploaded file is empty.", 400)
            if not _looks_like(kind, head):
                raise AnalysisError(f"Unsupported {kind} format.", 415)
        except BaseException:
            try:
                os.remove(path)
            except OSError:
                pass
            raise
        return SimpleNamespace(path=path, size=total)


__all__ = ["AnalysisError", "HOST_IMPORTABLE", "NotFound", "get_logger", "save_upload", "settings"]
