# Moody Lens – Extension Backend

This directory houses the backend integration endpoints and services for the Moody Lens Reddit extension.

## Module Layout

- `moody_lens_ext/`:
  - `media.py`: API v1 endpoints (`/api/v1/detect`, `/api/v1/jobs/{job_id}`, `/api/v1/health`, `/api/v1/detect-url`). Implements worker health checks and `MML_ALLOW_MOCK` guard (503 when workers are offline and mock mode is disabled).
  - `services/video_prep.py`: `ffprobe`/`ffmpeg` helpers: probe (duration cap, audio present) and mux a separate video and audio file into ONE mp4 (`-c copy`). Subprocess calls use argument lists and timeouts; temp files live in a `TempWorkspace` that callers always clean up. Needs ffmpeg and ffprobe on PATH (otherwise `503 FFMPEG_UNAVAILABLE`).
  - `services/url_resolver.py`: Tier-2 `/detect-url` download with `yt-dlp` (`pip install yt-dlp`), off unless `FEATURE_DETECT_URL=true`. Only https reddit.com post permalinks are accepted; size, duration and time caps apply; Reddit 403s map to `REDDIT_BLOCKED`.
  - Environment: `MOODY_LENS_MAX_VIDEO_SECONDS` (180), `MOODY_LENS_MAX_AUDIO_MB` (50), `MOODY_LENS_MAX_DOWNLOAD_MB` (50), `FEATURE_DETECT_URL` (false).
- `tests/`:
  - `conftest.py`: Test harness setting up `PYTHONPATH` for host backend and `moody_lens_ext`, fakeredis, in-memory SQLite, and stub detectors. Host fixtures are only defined when the host backend is importable.
  - `test_media_api.py`: Host contract, endpoint and error tests. Skipped (importorskip) without the host backend.
  - `test_media_glue.py`: Wiring tests (audio mux, detect-url, health `mock` flag) against a small fake host; real ffmpeg.
  - `test_video_prep.py`, `test_url_resolver.py`: ffmpeg helpers (real ffmpeg, skipped if absent) and the SSRF/error-mapping checks (no network).
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
