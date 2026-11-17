"""HTTP client for the Mad-Eye Moody Lens API (functional-ui-models-backend, /api/v1).

The bot never loads a model: every analysis goes to the shared backend, so Telegram users get
exactly the same pretrained models, verdict bands, limits and privacy rules as the web app.

Privacy: media bytes stay in memory and go straight to the API under a generic file name
(never the user's original one). Nothing here logs content, chat ids or user names.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

# Generic upload names per kind; the API sniffs magic bytes and ignores names and MIME types.
_UPLOAD_NAME = {"image": "upload.img", "audio": "upload.audio", "video": "upload.video"}


class ApiError(Exception):
    """The API refused or failed the request. ``message`` is plain language, safe to show users."""

    def __init__(self, message: str, status: int = 0, retry_after: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.retry_after = retry_after


def _error_from(response: httpx.Response) -> ApiError:
    """Map an API error response to ApiError, keeping the API's plain-language message verbatim."""
    try:
        message = str(response.json().get("error") or "")
    except ValueError:
        message = ""
    retry = response.headers.get("retry-after")
    retry_after = int(retry) if retry and retry.isdigit() else None
    if not message:
        message = {
            413: "The file is too large.",
            415: "This file type is not supported.",
            429: "Too many requests. Please wait a moment and try again.",
            503: "The detection service is starting up or busy. Please try again shortly.",
            504: "The analysis took too long. Please try a shorter clip.",
        }.get(response.status_code, "The detection service returned an error.")
    return ApiError(message, response.status_code, retry_after)


class MoodyLensClient:
    def __init__(
        self,
        base_url: str,
        api_key: str | None = None,
        *,
        sync_timeout_s: float = 45.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        headers = {"X-Client": "telegram-bot"}
        if api_key:
            headers["X-API-Key"] = api_key  # must be listed in the API's MML_API_KEYS for the higher limits
        # The API waits up to MML_SYNC_TIMEOUT_S (30 s) for image/audio; leave headroom for the upload.
        self._http = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers=headers,
            timeout=httpx.Timeout(sync_timeout_s, connect=5.0),
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            return await self._http.request(method, path, **kwargs)
        except httpx.TimeoutException as exc:
            raise ApiError("The detection service did not answer in time. Please try again.", 504) from exc
        except httpx.HTTPError as exc:
            raise ApiError("The detection service is unreachable right now.", 0) from exc

    # ------------------------------------------------------------- analyses
    async def analyze(self, kind: str, data: bytes) -> dict[str, Any]:
        """Image or audio: the API answers synchronously with an AnalysisResult."""
        if kind not in ("image", "audio"):
            raise ValueError(kind)
        files = {"file": (_UPLOAD_NAME[kind], data, "application/octet-stream")}
        response = await self._request("POST", f"/analyze/{kind}", files=files)
        if response.status_code != 200:
            raise _error_from(response)
        return response.json()

    async def start_video(self, data: bytes) -> dict[str, Any]:
        """Video: the API answers 202 with a JobStatus to poll."""
        files = {"file": (_UPLOAD_NAME["video"], data, "application/octet-stream")}
        response = await self._request("POST", "/analyze/video", files=files)
        if response.status_code != 202:
            raise _error_from(response)
        return response.json()

    async def job(self, job_id: str) -> dict[str, Any]:
        response = await self._request("GET", f"/jobs/{job_id}")
        if response.status_code != 200:
            raise _error_from(response)
        return response.json()

    async def cancel(self, job_id: str) -> None:
        try:
            await self._request("DELETE", f"/jobs/{job_id}")
        except ApiError:
            pass  # best effort: the job expires on its own

    async def wait_for_video(
        self,
        job_id: str,
        *,
        timeout_s: float,
        poll_s: float = 2.0,
        on_progress: Any = None,
    ) -> dict[str, Any]:
        """Poll until done/failed. ``on_progress(job)`` is awaited after every poll.

        On timeout the job is cancelled (the worker stops between frames) and ApiError raised.
        """
        deadline = time.monotonic() + timeout_s
        while True:
            job = await self.job(job_id)
            if job["status"] == "done" and job.get("result"):
                return job["result"]
            if job["status"] == "failed":
                raise ApiError(job.get("error") or "The video analysis failed.", 422)
            if on_progress is not None:
                await on_progress(job)
            if time.monotonic() >= deadline:
                await self.cancel(job_id)
                raise ApiError("The video analysis took too long and was cancelled. Try a shorter clip.", 504)
            await asyncio.sleep(poll_s)

    # ------------------------------------------------------------------ ops
    async def ready(self) -> tuple[bool, dict[str, Any]]:
        response = await self._request("GET", "/ready")
        try:
            body = response.json()
        except ValueError:
            body = {}
        return response.status_code == 200, body

    async def models(self) -> list[dict[str, Any]]:
        response = await self._request("GET", "/models")
        if response.status_code != 200:
            raise _error_from(response)
        return response.json()
