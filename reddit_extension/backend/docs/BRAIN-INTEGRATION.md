# Reddit API handoff to the shared backend

The [authoritative v1 contract and runnable requests](../../frontend/docs/API-CONTRACT.md) describe every endpoint. The Reddit API uses [DetectionBrain](../moody_lens_ext/brain/interface.py) and [HostBrain](../moody_lens_ext/brain/host_brain.py). A single copy of the host [detector registry](../../../functional-ui-models-backend/backend/app/detectors/registry.py) and [pipelines](../../../functional-ui-models-backend/backend/app/services/pipelines.py) handles inference for both web and Reddit clients.

The supplied Sprint 2 implementation guide (Downloads) was read: §4.3 defines the detector interface; §§4.4–4.9 cover modality adapters and the benchmark workflow; §§6.2–6.5 cover validation and asynchronous video; §7 covers stub testing; §§8.2–8.5 cover client polling and timelines; §9 covers cached model artifacts, containers and CI. Production access, detector selection and weight approval are outside this handoff.

## Run the Sprint 2 stub deployment

From the repository root, run the following in Bash/Git Bash. Use a fresh demo stack; preserve an existing `.env` if present.

```bash
cd functional-ui-models-backend
test -e .env || cp .env.example .env
# In .env, set MML_DETECTOR_BACKEND=stub, MML_BRAIN=host,
# MML_ALLOW_MOCK=false and MML_FEATURE_DETECT_URL=false.
# For this smoke only, set MML_ENV=development for internal /openapi.json.
# Ensure POSTGRES_PASSWORD matches the password in MML_DATABASE_URL.
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
curl -fsS http://localhost:8080/api/v1/health
curl -fsS http://localhost:8080/api/v1/ready
curl -fsS -H 'X-Client: extension' http://localhost:8080/api/v1/brain/status
docker compose -f docker-compose.prod.yml exec -T api python - <<'PY'
import json, urllib.request
# nginx blocks external docs. This reads the built app's internal OpenAPI.
with urllib.request.urlopen("http://localhost:8000/openapi.json") as response:
    paths = json.load(response)["paths"]
wanted = {
    "detect": "post", "detect/batch": "post", "jobs/{job_id}": "get",
    "health": "get", "brain/status": "get", "detect-url": "post",
    "verdicts/lookup": "get", "feedback": "post", "jobs/{job_id}/explain": "get",
}
for path, method in wanted.items():
    assert method in paths["/api/v1/" + path], (path, method)
job = paths["/api/v1/jobs/{job_id}"]
assert "delete" in job
schema = job["get"]["responses"]["200"]["content"]["application/json"]["schema"]
assert {v["$ref"].split("/")[-1] for v in schema["anyOf"]} == {"DetectionJob", "JobStatus"}
assert "get_job_status" in job["get"]["operationId"]
assert "health_v1" in paths["/api/v1/health"]["get"]["operationId"]
print("All nine Reddit operations mounted; native job GET/DELETE coexist.")
PY
```

Inside the container, the Dockerfile copies the Reddit package into `/app`. The image expects `MML_BRAIN=host` and refuses to start if the package is missing. The build context is the repository root; the equivalent standalone command is `docker build -f functional-ui-models-backend/backend/Dockerfile -t mml-backend:latest .`. The host mounts only one GET handler for each of `/health` and `/jobs/{job_id}` when the Reddit router is present; the job handler delegates native IDs to the existing web handler. Without the package (host-only source development), the host mounts its own GET handlers. In production, OpenAPI HTTP is disabled: inspect `app.openapi()` inside the image or use an isolated development-mode smoke.

Run the synthetic requests in [Runnable examples](../../frontend/docs/API-CONTRACT.md#runnable-examples). Check that the API returns 202 for video before inference completes; a fast stub worker may finish before the first poll. Check all poll results for `mock: true`, valid IDs/scores and null video audio on the silent clip. Verify native web job polling as well. For a gallery item inference failure, use the automated regression test (a malformed upload correctly fails admission instead).

Check independent readiness in the stub stack. In each case allow up to the heartbeat TTL (default 30 s) after stopping a worker, and wait for a fresh heartbeat after restarting it:

```bash
docker compose -f docker-compose.prod.yml stop worker-video
curl -fsS http://localhost:8080/api/v1/health
curl -fsS http://localhost:8080/api/v1/brain/status  # image/audio true, video false
docker compose -f docker-compose.prod.yml start worker-video
docker compose -f docker-compose.prod.yml stop worker-fast
curl -fsS http://localhost:8080/api/v1/health
curl -fsS http://localhost:8080/api/v1/brain/status  # image/audio false, video true once video is back
docker compose -f docker-compose.prod.yml start worker-fast
```

## Queue and storage contract

| Process | Command / prerequisites |
|---|---|
| API | Dockerfile runs Gunicorn with **one Uvicorn worker**. Use one replica. For source development, `reddit_extension/backend/run_dev.ps1` or `run_dev.sh` puts the Reddit package on the host Python path. |
| Fast worker | `MML_WORKER_QUEUES=inference.fast celery -A app.worker.celery_app worker -Q inference.fast --concurrency=1 --loglevel=INFO -n 'fast@%h'` |
| Video worker | `MML_WORKER_QUEUES=inference.video,maintenance celery -A app.worker.celery_app worker -Q inference.video,maintenance --concurrency=1 --loglevel=INFO -n 'video@%h'` |
| Maintenance | `celery -A app.worker.celery_app beat --loglevel=INFO --schedule /tmp/celerybeat-schedule`. Compose runs `alembic upgrade head` before API/workers. |

Use matching settings across API and workers: `MML_DATABASE_URL` (PostgreSQL + migrations), `MML_REDIS_URL` (job overlays, heartbeats, results, limits), optional `MML_BROKER_URL` (defaults to Redis; the queue-depth check assumes the same Redis), `MML_STORAGE_BACKEND=local` and shared writable `MML_STORAGE_ROOT=/data/uploads` (or S3 with `MML_S3_ENDPOINT_URL`, `MML_S3_BUCKET`, `MML_S3_ACCESS_KEY`, `MML_S3_SECRET_KEY`, `MML_S3_REGION`). `MML_TMP_DIR=/tmp/mml` and system temp need free writable space for validation/mux/worker copies. The API's `MML_EXT_DATA_DIR=/data/reddit-extension` is a separate SQLite volume for verdicts and feedback. Keep the host access, rate and CORS settings; provision production secrets and access separately.

Hosted image/audio dispatch waits up to `MML_SYNC_TIMEOUT_S` (30 s by default); gallery jobs are asynchronous with sequential fast waits. Video uploads and URL requests share two in-flight API slots; one gallery can run at once. Admission refuses new jobs when those slots are full. The shared dispatcher checks ready workers and `MML_MAX_QUEUE_DEPTH` (50 pending) before dispatch; if capacity is lost after the request is accepted, a job or gallery item fails. Keep workload below measured worker capacity: an earlier video can use most of the second job's queue budget. Video soft/hard limits are `MML_VIDEO_SOFT_TIME_LIMIT_S` / `MML_VIDEO_TIME_LIMIT_S` (240/300 s). The wrapper requests cancellation at hard limit + 30 s (330 s total from dispatch). Fast tasks default to 25/30 s soft/hard via `MML_FAST_SOFT_TIME_LIMIT_S` / `MML_FAST_TIME_LIMIT_S`. The default frontend budgets leave time for polling and the optional 90 s downloader. If you increase these limits, revisit nginx's 60 s request deadline for validation/fast submits and update extension poll budgets. Measure split-track preparation and queue wait on the actual deployment.

FastAPI owns request and temporary preparation files; post-response work cleans them on success, failure and slot release. The host owns stored keys once accepted by Celery; workers delete them on success and final failure and retain them across retryable failures. Cancellation flags are cooperative between video frames; queued revokes or hard worker/process loss can leave files for the hourly sweep (older than one hour). API tmpfs is reset on container recreation. Native results and jobs expire on their host schedules (`MML_RESULT_RETENTION_DAYS`, `MML_JOB_TTL_H`); SQLite feedback/cache retention is separate.

The single-process job map is intentional for Sprint 2. An API process restart loses its `job-…` IDs and any work still in its in-process orchestration; polls return 404. A dispatched native worker job can still complete and clean uploads. Native web IDs and the SQLite volume are independent of the extension map. Before multi-process or replica deployment, persist extension state and host job mapping (e.g. TTL rows in PostgreSQL or existing Redis), run orchestration durably in the existing Celery stack, move the extension cache/feedback to shared storage that supports concurrent deployment, and prove submit on one replica / poll on another, including restart and expiry.

## Wire the Sprint 2 detectors

Use `MML_BRAIN=host`, `MML_DETECTOR_BACKEND=real`, `MML_ALLOW_MOCK=false`. The IDs already in [the example environment](../../../functional-ui-models-backend/.env.example) are candidate defaults, not a selection or license approval. Implement or swap the detector in the host registry and keep the corresponding pipeline task strings:

| Check | Host wiring | Extension output |
|---|---|---|
| AI-generated image | `image.py`, `run_image`, `ai_generated_image`; `MML_IMAGE_MODEL_ID`, `MML_IMAGE_MODEL_REVISION` (HF commit SHA) | `models.image` |
| Face manipulation on an image | `face.py`, face crop/detect then score, `face_manipulation`; `MML_FACE_MODEL_ID`, `MML_FACE_MODEL_URL`, `MML_FACE_MODEL_SHA256`, `MML_FACE_MODEL_NORMALIZE`, `MML_FACE_MAX`, `MML_FACE_MARGIN` | `models.face`, null if no face |
| Standalone synthetic speech | `audio.py`, `run_audio`, `synthetic_speech`; `MML_AUDIO_MODEL_ID`, `MML_AUDIO_MODEL_REVISION`, `MML_AUDIO_WINDOW_S` | `models.audio` and measured window bounds |
| Visual video | `video.py`, `run_video`, same face detector, `face_manipulation`; `MML_VIDEO_FRAMES`, `MML_VIDEO_FLAG_THRESHOLD` | `models.face` and real frame ranges when available; current real face-only video detector fails if it finds no faces |
| Optional video audio | `run_video` extracts/decode audio and calls the same speech detector; `MML_VIDEO_CHECK_AUDIO` (default true) | `models.audio`, null for skipped checks; valid visual verdict survives absent, silent or undecodable audio |

Model adapters should provide verified artifact revisions and scores in [host schemas](../../../functional-ui-models-backend/backend/app/schemas.py), including useful measured ranges. An alternative `DetectionBrain` implementation must supply actual readiness/capabilities and change its version when results can change. Keep `MML_DEVICE`, `MML_TORCH_THREADS`, `MML_AGGREGATION`, `MML_AGGREGATION_WEIGHTS`, `MML_BAND_LOW`, `MML_BAND_HIGH` and preprocessing settings aligned across worker/API processes. Demo output must stay marked `mock`. Extension explanations remain off with HostBrain; Grad-CAM is optional and host web explanations are a separate existing API.

Once artifacts and licenses are approved, fill model settings and prewarm the volume before restarting with offline worker defaults:

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -e HF_HUB_OFFLINE=0 -e TRANSFORMERS_OFFLINE=0 worker-fast python -m scripts.download_models
# Record the printed HF commit SHAs and face SHA-256 in the shared .env, then:
docker compose -f docker-compose.prod.yml up -d --force-recreate api worker-fast worker-video
curl -fsS http://localhost:8080/api/v1/ready
curl -fsS http://localhost:8080/api/v1/brain/status
```

Check that each loaded identity matches its configured pin, both queues are ready, and `is_mock=false`. Re-run the API examples with consented samples: image with and without a face, standalone speech, silent video with visible faces, same video with two different speech tracks, and a gallery. Confirm expected null scores, measured locations only, and revision/namespace invalidation. Run `python -m scripts.benchmark --help` in the host backend and follow guide §5 for consented benchmark data and license review. If enabling the optional URL fallback, add an approved/pinned yt-dlp to the deployment's API image, smoke disabled/enabled behavior, and test a consented Reddit permalink from the real egress network.

## Owners and verification

| Owner | Next responsibility |
|---|---|
| Reddit extension API | Maintain v1 schemas, exact-input keys, test fixtures and compatibility. |
| Shared worker and model team | Benchmark, review licenses, select and pin weights; plug models into the registry and run worker readiness, score and timing checks above. |
| Deployment team | Complete real container smoke, volume backups/retention, secrets, access and infrastructure configuration. Keep one API process until shared routing is implemented. |
| Reddit extension QA | With the unpacked extension and a signed-in Reddit session, verify source and earlier matches, exact evidence copying, composer rules/flair and draft scans, and moderator review notes. Exercise queue outages and optional resolver; do not submit posts or modmail as part of the smoke. |

Reproduce local automated checks (install host `requirements.txt` and `requirements-dev.txt`, FFmpeg/FFprobe, and frontend lockfile dependencies first):

```bash
(cd reddit_extension/backend && python -m pytest -ra)
(cd reddit_extension/backend && MML_TEST_FAKE_HOST=1 python -m pytest -ra tests/test_media_glue.py)
(export PYTHONPATH="$PWD/reddit_extension/backend"; cd functional-ui-models-backend/backend && python -m pytest -ra --ignore=tests/test_real_face_model.py)
(cd reddit_extension/frontend && npm run typecheck && npm test && npm run build)
```

Verified branch: `darshan-dev`. Preserved frontend commits: `57fc7ad` (sources and matches), `323c6d7` (verification context), `b47b4a4` (composer checks), `2b3ba0a` (review notes). See the [API inventory](../../frontend/docs/API-CONTRACT.md#endpoint-inventory) and [examples](../../frontend/docs/API-CONTRACT.md#runnable-examples). Verification log follows below.

| Check | Observed result |
|---|---|
| Reddit/backend with host stubs and FFmpeg | 99 passed, 2 skipped (the isolated fake-host module and the no-host-only auto-mode case). Verified 202 before inference with an intentionally blocked video runner, gallery item failure, cleanup, namespace changes, expiry and both queue outages. |
| Fake-host integration with FFmpeg | 11 passed. No separate track, track A and track B round-tripped to three correct cache entries. Also verified URL download failure becomes a failed job. |
| Shared host with Reddit router mounted | 42 passed. The separate EfficientNet/Grad-CAM suite using generated weights was skipped because OpenCV was unavailable. |
| Extension | Typecheck and production build passed; 239 unit tests passed. Playwright with local Chrome: manifest test passed; three extension-loading smoke tests failed before inference (no lens/service worker). All three failures reproduced on the untouched `2b3ba0a` baseline. |
| Live HTTP with separate stub Celery workers and containerized PostgreSQL/Redis | Passed. The OpenAPI included all nine Reddit operations. Image, audio, silent video, two separate audio tracks, gallery, lookup, feedback, disabled URL/explain, native video polling and API liveness after stopping the video worker all passed. |
| Linux container packaging | Passed in a stripped smoke image using the production Dockerfile's copy paths, non-root user and Gunicorn command with minimal Python dependencies. Verified internal OpenAPI, shared job route dispatch, and image submit/poll/cache against Linux Celery, PostgreSQL and Redis. |
| Full Docker Compose | `config --quiet` passed. The unmodified production dependency install in `docker compose -f docker-compose.prod.yml build api` stopped at APT exit 100: the Debian mirror closed the `libflite1` transfer. The full image and nginx smoke remain pending. |

Deployment team: rerun `docker compose -f docker-compose.prod.yml build api`, bring up the full stack, and execute the internal OpenAPI and proxied upload/poll commands above on a host that can fetch the Debian and CPU wheel dependencies. Shared worker team: supply the approved pins and run the model prewarm, ready and consented inference checks. Reddit QA: use an extension-capable browser for the fixture smoke and repeat with a signed-in Reddit session; no signed-in Reddit actions were run for this handoff.
