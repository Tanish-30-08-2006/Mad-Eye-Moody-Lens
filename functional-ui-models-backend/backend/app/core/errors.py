"""Domain errors.

Anything derived from :class:`AnalysisError` is an *expected* failure: its
``message`` is plain language and reaches the user unchanged as
``{"error": message}`` (the frontend renders it verbatim). Unexpected
exceptions never leak details; they become "Internal error during analysis."
"""

from __future__ import annotations


class AnalysisError(Exception):
    """Expected, user-facing failure with an HTTP status code."""

    status_code: int = 422

    def __init__(self, message: str, status_code: int | None = None, headers: dict[str, str] | None = None):
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.headers = headers or {}

    # Celery serialises task exceptions; keep them reconstructable.
    def __reduce__(self):  # type: ignore[no-untyped-def]
        return (AnalysisError, (self.message, self.status_code, self.headers))


class NoFaceFound(AnalysisError):
    def __init__(self) -> None:
        super().__init__("No face was detected, so the face-manipulation check could not run.", 422)

    def __reduce__(self):  # type: ignore[no-untyped-def]
        return (NoFaceFound, ())


class FileTooLarge(AnalysisError):
    def __init__(self, max_mb: int) -> None:
        super().__init__(f"File is larger than {max_mb} MB.", 413)
        self.max_mb = max_mb

    def __reduce__(self):  # type: ignore[no-untyped-def]
        return (FileTooLarge, (self.max_mb,))


class UnsupportedFormat(AnalysisError):
    def __init__(self, kind: str) -> None:
        super().__init__(f"Unsupported {kind} format.", 415)
        self.kind = kind

    def __reduce__(self):  # type: ignore[no-untyped-def]
        return (UnsupportedFormat, (self.kind,))


class RateLimited(AnalysisError):
    def __init__(self, retry_after_s: int) -> None:
        super().__init__(
            f"Too many requests. Try again in {retry_after_s} seconds.",
            429,
            {"Retry-After": str(retry_after_s)},
        )


class NotReady(AnalysisError):
    def __init__(self) -> None:
        super().__init__("The detectors are still loading. Try again shortly.", 503)


class QueueFull(AnalysisError):
    def __init__(self) -> None:
        super().__init__("The server is busy. Try again in a minute.", 503, {"Retry-After": "60"})


class AnalysisTimeout(AnalysisError):
    def __init__(self) -> None:
        super().__init__("The analysis took too long. Try a smaller file.", 504)


class NotFound(AnalysisError):
    def __init__(self, what: str) -> None:
        super().__init__(f"{what} not found.", 404)


class NoExplanation(AnalysisError):
    def __init__(self) -> None:
        super().__init__("No explanation is available for this analysis.", 404)


class Cancelled(AnalysisError):
    def __init__(self) -> None:
        super().__init__("Cancelled.", 409)

    def __reduce__(self):  # type: ignore[no-untyped-def]
        return (Cancelled, ())


INTERNAL_ERROR_MESSAGE = "Internal error during analysis."
