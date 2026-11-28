"""FastAPI application entry point (``gunicorn app.main:app -k uvicorn.workers.UvicornWorker``).

Cross-cutting concerns live here:

* request id: read ``X-Request-ID`` or mint one, echo it, bind it to every log line;
* metrics: count and time every route (by route template, never raw paths);
* security headers on every response;
* error mapping: ``AnalysisError`` -> ``{"error": message}`` with its status code;
  anything unexpected -> 500 ``{"error": "Internal error during analysis."}``;
* client integrations: the Reddit extension API (``moody_lens_ext``, reddit_extension/backend)
  is mounted on the same ``/api/v1`` prefix when importable, and extension origins get CORS.
  Its job map lives in process memory, so the API must run ONE Gunicorn worker (Dockerfile).
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, File, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app import __version__
from app.api.routes import router
from app.core.config import settings
from app.core.errors import INTERNAL_ERROR_MESSAGE, AnalysisError
from app.core.logging import bind_context, clear_context, configure_logging, get_logger, new_request_id, request_id_var
from app.core.metrics import HTTP_REQUESTS, HTTP_SECONDS

log = get_logger(__name__)

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store",  # results are per-user; never cache them in proxies
}


@asynccontextmanager
async def lifespan(_app: FastAPI):  # type: ignore[no-untyped-def]
    configure_logging(settings.log_level, json_logs=settings.is_production)
    log.info("api_start", version=__version__, env=settings.env, storage=settings.storage_backend)
    yield
    log.info("api_stop")


def create_app() -> FastAPI:
    prod = settings.is_production
    app = FastAPI(
        title="Mad-Eye Moody Lens API",
        version=__version__,
        lifespan=lifespan,
        # Interactive docs are for development; nginx also blocks them in production.
        docs_url=None if prod else "/docs",
        redoc_url=None,
        openapi_url=None if prod else "/openapi.json",
    )

    # The web app is same-origin behind nginx and needs no CORS. Browser extensions are a
    # different origin (chrome-extension://<id>); MV3 service workers with host permissions
    # bypass CORS, but extension pages and content scripts do not.
    if settings.cors_origins or settings.cors_origin_regex:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_origin_regex=settings.cors_origin_regex or None,
            allow_methods=["GET", "POST", "DELETE"],
            allow_headers=["Content-Type", "X-Request-ID", "X-API-Key", "X-Client", "X-ZeroTrue-Key"],
            expose_headers=["X-Request-ID", "Retry-After"],
        )

    @app.middleware("http")
    async def request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
        rid = request.headers.get("x-request-id") or new_request_id()
        token = request_id_var.set(rid[:64])
        clear_context()
        bind_context(request_id=rid[:64])
        t0 = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
        finally:
            route = request.scope.get("route")
            label = getattr(route, "path", "unmatched")
            HTTP_REQUESTS.labels(label, str(status)).inc()
            HTTP_SECONDS.labels(label).observe(time.perf_counter() - t0)
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = rid[:64]
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        return response

    @app.exception_handler(AnalysisError)
    async def analysis_error(_: Request, exc: AnalysisError) -> JSONResponse:
        return JSONResponse({"error": exc.message}, status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
        # Keep the documented shape for framework errors (404 route, 405 method).
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def unexpected(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled_error", error_type=type(exc).__name__)
        return JSONResponse({"error": INTERNAL_ERROR_MESSAGE}, status_code=500)

    @app.post("/api/duplicate-detection/compare", include_in_schema=False)
    async def duplicate_detection_alias(
        request: Request,
        files: list[UploadFile] = File(...),
    ) -> JSONResponse:
        from app.services import duplicate_detector
        res = await run_in_threadpool(duplicate_detector.compare_batch, files)
        return JSONResponse(res.model_dump())

    ext_router = _extension_router()
    # The extension router goes FIRST: its GET /health and GET /jobs/{id} are supersets of
    # ours (they answer the web app exactly as before and delegate native job ids to
    # routes.get_job), so it must own those two operations.
    sources = [ext_router, router] if ext_router is not None else [router]
    app.include_router(_merge_routers(sources))
    return app


def _extension_router():  # type: ignore[no-untyped-def]
    """The Reddit extension API (``moody_lens_ext``), when its package is on the path.

    The Docker image always ships it (see Dockerfile); plain host-only development
    without it on PYTHONPATH keeps working with the native routes alone.
    """
    try:
        from moody_lens_ext.media import router as ext_router  # noqa: PLC0415
    except ImportError:
        log.info("extension_api_absent")
        return None
    return ext_router


def _merge_routers(sources: list[APIRouter]) -> APIRouter:
    """One router with a single handler per (path, method); the earliest source wins.

    Starlette would route to the first match anyway, but OpenAPI would still list the
    shadowed handler (and newer FastAPI keeps the *last* one there), so the duplicate is
    dropped before mounting. Route paths already carry the ``/api/v1`` prefix.
    """
    merged = APIRouter()
    seen: set[tuple[str, str]] = set()
    for source in sources:
        for route in source.routes:
            keys = {(getattr(route, "path", ""), m) for m in getattr(route, "methods", None) or ()}
            if keys and keys <= seen:
                continue
            seen |= keys
            merged.routes.append(route)
    return merged


app = create_app()
