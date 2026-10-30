"""FastAPI application entry point (``gunicorn app.main:app -k uvicorn.workers.UvicornWorker``).

Cross-cutting concerns live here:

* request id: read ``X-Request-ID`` or mint one, echo it, bind it to every log line;
* metrics: count and time every route (by route template, never raw paths);
* security headers on every response;
* error mapping: ``AnalysisError`` -> ``{"error": message}`` with its status code;
  anything unexpected -> 500 ``{"error": "Internal error during analysis."}``.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
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

    if settings.cors_origins:  # same-origin behind nginx needs no CORS at all
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET", "POST", "DELETE"],
            allow_headers=["Content-Type", "X-Request-ID", "X-API-Key"],
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

    app.include_router(router)
    return app


app = create_app()
