# CLAUDE.md — Mad-Eye Moody Lens

Context for Claude (and any new teammate) working in this repository. Read this before changing code.

## What this is

Mad-Eye Moody Lens is the DA-IICT **IT314 Software Engineering** group project. It is a web app that estimates whether an uploaded **image, audio clip or video** is AI-generated or manipulated, using **pretrained models only**. The team does not train any model.

- Sprint 1: requirements, stakeholders and datasets.
- Sprint 2: model selection and the backend/frontend around the models.
- Sprint 3: production hardening, and Grad-CAM heatmaps shown in the UI.
- Design source of truth: *Mad-Eye Moody Lens — Production Backend Design* (the shared design doc, sections 1–13). This file summarises it; when they disagree, the design doc wins, and you update this file.

## Fixed decisions (do not change without a logged requirements change)

| Area | Decision |
| --- | --- |
| Image model | `Organika/sdxl-detector` (Swin Transformer, CC BY-NC 3.0) |
| Face model | `Xicor9/efficientnet-b0-ffpp-c23` (EfficientNet-B0 **CNN**, class 1 = fake). It is the only CNN; the SRS wording is "pretrained deep-learning models" |
| Audio model | `MelodyMachine/Deepfake-audio-detection-V2` (wav2vec2-family, Apache-2.0), 16 kHz mono, 4 s windows |
| Video | 24 evenly sampled frames scored by the face model, plus the audio track scored by the audio model |
| Hardware | **CPU only**: no GPU for the demo or deployment. Laptop with **8 GB RAM / 256 GB disk** |
| Hosting | Laptop-only demo with Docker Compose (`docker-compose.prod.yml`), bound to `127.0.0.1:8080` |
| Retention | Results and heatmaps are kept **7 days**; jobs 24 h; uploads are deleted when their task ends |
| Explanations | Grad-CAM for the face model only, via `GET /api/v1/analyses/{id}/explanation`. The frontend shows it on the result card |
| Verdict | Overall score = **max** over the checks. Bands: ≤ 0.35 `likely_real`, ≥ 0.65 `likely_fake`, otherwise `uncertain` |

## Repository map

```
backend/                 FastAPI API + Celery workers (one Docker image, several roles)
  app/main.py            app factory: request-id + metrics middleware, security headers, error → {"error"}
  app/schemas.py         THE API CONTRACT (mirrors frontend/src/api/client.ts)
  app/api/routes.py      /api/v1 routes; blocking work goes to the thread pool
  app/core/              config (MML_* env), errors, logging, metrics, storage, uploads, rate limits, redis
  app/db/                SQLAlchemy models (analyses, jobs) + session; Alembic in migrations/
  app/detectors/         Detector interface (base.py), real models, stubs, registry
  app/preprocessing/     Haar face crops, ffmpeg/ffprobe helpers
  app/services/          verdict, pipelines (image/audio/video + Grad-CAM), jobs, results, heartbeat, dispatch
  app/worker/            Celery app (queues, init signal) + tasks
  scripts/               download_models, benchmark, check_parity
  tests/                 stub-based API suite + real EfficientNet/Grad-CAM tests
frontend/                React + Vite + TS; editorial design system; nginx.conf proxies /api
docker-compose.prod.yml  proxy, api, migrate, worker-fast, worker-video, beat, postgres, redis (+ telegram-bot profile)
.env.example             every runtime setting with its default
```

Client integrations (repository root, next to `functional-ui-models-backend/`). None of them loads a model; all use this API:

```
reddit_extension/backend/  moody_lens_ext: Reddit extension API router, mounted into app.main when importable
                           (Dockerfile COPY --from=reddit; dev.sh api adds it to PYTHONPATH)
telegram-bot/              mml_bot: Telegram client of /api/v1 (image, audio, video), compose profile "telegram"
browser-extension/backend/ unified MV3 service worker: image + audio (Chrome extension) + video engine;
                           provider "moodylens" = this API. Tests: node --test tests/
```

## Architecture rules

1. **The API process never imports PyTorch, transformers, librosa or OpenCV.** Models load only in Celery workers. Heavy imports go *inside* functions (`# noqa: PLC0415`), never at module top level in anything the API imports.
2. **Two queues:**
   - `inference.fast` handles image and audio. The API waits up to 30 s, then returns 504.
   - `inference.video` handles video. The API returns 202 and the browser polls `/jobs/{id}`.
   - The `maintenance` queue (hourly retention sweep) is consumed by the video worker.
3. **Worker memory budget on the laptop.** One task per worker process (`--concurrency=1`).
   - `worker-fast` loads image + face + audio, limit 2.5 GB.
   - `worker-video` loads face + audio only (no Swin), limit 1.75 GB.
   - Don't add a model to a queue without re-checking the budget in the design doc (Section 11).
4. **`GET /models` and `GET /ready` come from worker heartbeats in Redis** (`worker:<id>`, TTL 30 s), because the API has no models to inspect.
5. **The registry is built once per process** through a lock-guarded `get_registry()`. Don't replace it with `lru_cache`: a start-up race built two registries and broke readiness.
6. **Video progress semantics:** 0→1 over the sampled frames only. It then holds at 1.0 through `stage = audio` and `stage = finalising` (Grad-CAM). The frontend's status text depends on this.
7. **One API process.** The Reddit router keeps its `job-…` map in process memory, so Gunicorn runs `-w 1`. Don't raise it until that state moves to Redis or PostgreSQL.
8. **One handler per route.** `app.main._merge_routers` mounts the Reddit router first. Its `GET /health` and `GET /jobs/{id}` replace the native ones and delegate native job ids to `routes.get_job`. The web contract is unchanged.
9. **Silent soundtracks are not speech.** Video audio quieter than `MML_VIDEO_SILENCE_DBFS` (-60) is skipped, so `audio_checked` is absent, the same as no track.

## API contract invariants (breaking any of these needs `/api/v2`)

- Paths: `/api/v1/health`, `/models`, `/analyze/image|audio` (200), `/analyze/video` (202), `/jobs/{id}`.
- Multipart field name `file`.
- Verdict strings `likely_real | uncertain | likely_fake`. Task strings `ai_generated_image | face_manipulation | synthetic_speech`. Job statuses `queued | running | done | failed`.
- `details` keys:
  - image: `faces_found`
  - audio: `duration_s`
  - video: `frames_sampled`, `frames_with_face`, `max_frame_probability`, `fraction_flagged`, `audio_checked` (key absent = no audio track)
- Expected errors are `{"error": "<plain-language message>"}` and the frontend shows that text verbatim. Raise an `AnalysisError` subclass (`app/core/errors.py`). Never put stack traces or internals in a message.
- Additive changes are fine: new endpoints and new optional fields. Bump `API_VERSION` in `schemas.py` and add the optional field to `client.ts` too.

`python -m scripts.check_parity ../frontend` (run in CI) fails if the frontend and backend disagree on any of:
- model IDs, size limits, frame count, window length, bands;
- any schema field.

## Privacy and security rules (non-negotiable)

- Never store or log media bytes, frames, face crops, original file names, EXIF, or client IPs.
- Rate limiting keys on an **HMAC** of the IP or API key, and expires with its window.
- Heatmaps hold **attention values and a box only, no pixels**. The browser overlays them on the user's own local file.
- Validate uploads in this order:
  1. stream with a size cap (413);
  2. sniff magic bytes (415);
  3. deep-check (Pillow `verify` with a pixel cap; `ffprobe` duration and resolution caps) (422).
- Never trust the file name or the browser MIME type.
- `Image.MAX_IMAGE_PIXELS` is process-global: set it once at import, never per request.
- Models load with `trust_remote_code=False`, pinned revisions, and a SHA-256 check on the face weights. Workers run with `HF_HUB_OFFLINE=1`.
- Every label map is self-checked at load (`check_label_map`). An unmappable or inverted model must leave `loaded=false` rather than serve.
- Licences: the image and face weights are non-commercial or research-only. Keep this coursework and say so on the About page.

## Commands

```bash
# Backend dev (stub models: no weights, no torch needed for the API suite)
cd backend
pip install -r requirements.txt -r requirements-dev.txt   # torch/torchvision: CPU index, see Dockerfile
pytest -q                                   # full suite (real face-model tests skip without torch)
ruff check app tests scripts && mypy app
python -m scripts.check_parity ../frontend

# Frontend
cd frontend && npm ci && npm run dev        # http://localhost:5173; Vite proxies /api to :8000 (.env.development)

# Full stack locally without Docker (macOS, 4 terminals; README has the setup)
cp backend/.env.dev.example backend/.env    # SQLite ./data/mml.db, local uploads, one worker for all queues
redis-server                                                     # T1
celery -A app.worker.celery_app worker -Q inference.fast,inference.video,maintenance \
  --pool=solo -n dev@%h --loglevel=INFO                          # T2 (backend/, venv)
uvicorn app.main:app --reload --port 8000                        # T3 (backend/, venv)
npm run dev                                                      # T4 (frontend/)

# Full stack on the laptop
cp .env.example .env                        # set POSTGRES_PASSWORD, MML_CLIENT_HASH_SECRET
docker compose -f docker-compose.prod.yml run --rm -e HF_HUB_OFFLINE=0 -e TRANSFORMERS_OFFLINE=0 \
  worker-fast python -m scripts.download_models   # once; paste the printed pins into .env
docker compose -f docker-compose.prod.yml up -d
curl localhost:8080/api/v1/ready            # 200 once workers have loaded models
# Whole stack without weights: set MML_DETECTOR_BACKEND=stub in .env

# Benchmark (sets bands, normalisation, memory limits)
python -m scripts.benchmark --detector face --data ../data/faces --out face.csv
```

## Code conventions

- **Annotate the why, not the what.** Every module starts with a docstring naming its design-doc section and its constraints. Comments explain decisions: privacy, memory, contract, race conditions.
- Python 3.11, type hints everywhere, `ruff` (line length 120) and `mypy` clean.
- Settings come only from `app.core.config.settings` (`MML_*` env vars). No hard-coded limits in logic.
- Database access is synchronous SQLAlchemy through `session_scope()`. From async routes, call it via `run_in_threadpool`.
- Celery tasks return errors **as data** (`{"ok": False, "error", "status"}`), not as pickled exceptions.
  - Only infrastructure errors retry (max 2).
  - An upload is deleted only when its task is final, never before a retry that still needs it.
- User-facing strings are plain language and short. They appear verbatim in the UI.
- Frontend design rules:
  - background `#f7f6f2`, accent `#3d7068`, 1px `#e5e4de` borders, corner radius ≤ 2px;
  - no gradients;
  - Space Mono for all numbers and metadata;
  - verdicts shown with colour + shape + text.

## Testing

- `tests/conftest.py` sets env vars **before** importing the app. It uses:
  - stub detectors (`MML_DETECTOR_BACKEND=stub`);
  - eager Celery;
  - in-memory SQLite;
  - fakeredis;
  - temp local storage.
- Stub scores: image 0.9, face 0.8, audio 0.2. The video stub draws a sine over 24 frames. Set `get_registry()["face"].faces = False` to simulate "no face".
- `tests/test_real_face_model.py` exercises the real EfficientNet-B0 load, the SHA-256 refusal, batching, Grad-CAM and OpenCV frame sampling, using random weights. Score values are meaningless there; the benchmark covers accuracy.
- Add a test for every new status code or `details` key. Any contract change also needs `check_parity` to pass.

## Changing a model (the only supported way)

1. Benchmark the candidate (`scripts/benchmark.py`) on the held-out Sprint 1 split. Record AUC, EER, latency and peak RSS in the model-selection report.
2. Set `MML_*_MODEL_ID` and the revision or SHA-256 pin in `.env`, then re-run `download_models`.
3. Update the matching entry in `frontend/src/config/models.ts` (id, architecture, licence, weaknesses), then run `check_parity`.
4. Re-check the worker memory budget for the 8 GB laptop.

## Open items

- Final latency targets: from the Sprint 1 NFRs, confirmed by the benchmark on the demo laptop.
- `max` vs weighted aggregation: decided by the benchmark's false-alarm rate on real photos with faces (`MML_AGGREGATION`).
