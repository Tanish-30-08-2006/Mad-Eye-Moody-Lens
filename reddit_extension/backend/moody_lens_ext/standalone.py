"""standalone.py – Dev-only FastAPI app serving the extension API without the host backend (use with MML_BRAIN=stub): `uvicorn moody_lens_ext.standalone:app`."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .media import router

app = FastAPI(title="Moody Lens extension API (standalone)")

# Dev only: the real deployment pins CORS to the extension origin in the host app.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Client"],
)
app.include_router(router)
