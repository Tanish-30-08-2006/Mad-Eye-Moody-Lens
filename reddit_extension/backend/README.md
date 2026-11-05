# Moody Lens – Extension Backend

This directory houses the backend integration endpoints and service stubs for the Moody Lens Reddit extension.

## Module Layout

- `moody_lens_ext/`:
  - `media.py`: API v1 endpoints (`/api/v1/detect`, `/api/v1/jobs/{job_id}`, `/api/v1/health`, `/api/v1/detect-url`). Implements worker health checks and `MML_ALLOW_MOCK` guard (503 when workers are offline and mock mode is disabled).
  - `services/url_resolver.py`: Tier-2 fallback URL ingestion service stub.
  - `services/video_prep.py`: Keyframe extraction and audio demuxing service stub.
- `tests/`:
  - `conftest.py`: Test harness setting up `PYTHONPATH` for host backend and `moody_lens_ext`, fakeredis, in-memory SQLite, and stub detectors.
  - `test_media_api.py`: 13 comprehensive unit, contract parity, and error handling tests.
- `run_dev.ps1` / `run_dev.sh`: Development launchers setting `PYTHONPATH` to include `reddit_extension/backend` before running the host FastAPI application via Uvicorn.
- `pytest.ini`: Configures test discovery and module resolution.

## How to Run the Development Server

From this directory:

### Windows PowerShell
```powershell
.\run_dev.ps1
```

### Linux / macOS
```bash
chmod +x run_dev.sh
./run_dev.sh
```

## Running Tests

From `reddit_extension/backend`:
```bash
pytest tests -v
```

From repository root:
```bash
pytest reddit_extension/backend/tests -v
```

## Docker Caveat

> [!NOTE]
> The host Docker container (`functional-ui-models-backend/Dockerfile`) does not copy or include `reddit_extension/backend` on its `PYTHONPATH`. 
> 
> Thanks to the guarded import in `functional-ui-models-backend/backend/app/main.py`:
> ```python
> try:
>     from moody_lens_ext.media import router as v1_media_router
>     app.include_router(v1_media_router)
> except ImportError:
>     log.warning("reddit_extension_router_unavailable")
> ```
> The host backend starts normally in Docker containers even without the extension backend present. Incorporating extension routes into containerized deployments requires a Docker build update that must be approved by the repository owner.
