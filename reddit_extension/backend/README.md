# Moody Lens Reddit API

The [v1 contract](../frontend/docs/API-CONTRACT.md) lists the routes and runnable requests. Use the [Sprint 2 handoff](docs/BRAIN-INTEGRATION.md) to build the shared host image, run the stub smoke tests and connect approved detectors.

For host source development, run `./run_dev.sh` or `.\run_dev.ps1` from this directory. These launchers put the Reddit package on the shared host's Python path. For extension-only development without a worker, run `MML_BRAIN=stub python -m uvicorn moody_lens_ext.standalone:app --port 8000` (set the environment variable separately in PowerShell). Every stub result is marked as demo data.

Run `python -m pytest -ra` here for the shared host and stub contract suite. To exercise the fake host separately, set `MML_TEST_FAKE_HOST=1` and run `python -m pytest -ra tests/test_media_glue.py`. Add ffmpeg and ffprobe to PATH for the media fixtures. The optional Reddit downloader is disabled by default.
