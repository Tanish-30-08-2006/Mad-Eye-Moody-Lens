# Mad-Eye Moody Lens

Mad-Eye Moody Lens is the IT314 project at DA-IICT. It gives a probabilistic estimate of whether an image, a voice clip or a video is AI-generated or manipulated. It uses three pretrained detectors and shows Grad-CAM heatmaps for the face model.

| Media | Model | What it checks |
| --- | --- | --- |
| Image | `Organika/sdxl-detector` (Swin) | Whole image synthesised by a diffusion model |
| Faces (images + video frames) | `Xicor9/efficientnet-b0-ffpp-c23` (EfficientNet-B0 CNN) | Face swap / re-enactment, with Grad-CAM |
| Audio (clips + video soundtracks) | `MelodyMachine/Deepfake-audio-detection-V2` (wav2vec2) | Synthetic speech, in 4 s windows |

## Run it on a laptop (8 GB RAM, CPU only)

Give Docker Desktop at least 6 GB of memory. The images and model weights need about 8 GB of disk.

```bash
cp .env.example .env            # set POSTGRES_PASSWORD (also in MML_DATABASE_URL) and MML_CLIENT_HASH_SECRET

# 1. Download the models once (needs internet), then paste the printed pins into .env
docker compose -f docker-compose.prod.yml run --rm -e HF_HUB_OFFLINE=0 -e TRANSFORMERS_OFFLINE=0 \
  worker-fast python -m scripts.download_models

# 2. Start everything
docker compose -f docker-compose.prod.yml up -d

# 3. Wait for the workers to load their models, then open the app
curl http://localhost:8080/api/v1/ready
open http://localhost:8080
```

To try the whole stack without downloading weights, set `MML_DETECTOR_BACKEND=stub` in `.env`. Fixed scores flow through every screen, including the heatmaps.

## Run it locally without Docker (4 terminals, macOS)

Install the system tools once, then let the launcher set up everything else:

```bash
brew install python@3.12 redis ffmpeg node
cd mad-eye-moody-lens
chmod +x dev.sh
./dev.sh setup        # backend/.venv, Python + npm packages, backend/.env, SQLite database
```

Start each piece in its own terminal. `dev.sh` works from any folder: it always moves into the right folder and uses `backend/.venv`'s Python.

| Terminal | Command | What it is |
| --- | --- | --- |
| 1 | `./dev.sh redis` | Queue and heartbeats |
| 2 | `./dev.sh worker` | Loads the models and runs every analysis (first start downloads them) |
| 3 | `./dev.sh api` | FastAPI on http://localhost:8000 (docs at `/docs`) |
| 4 | `./dev.sh web` | Frontend on http://localhost:5173 |

Open http://localhost:5173. `./dev.sh check` prints the readiness status; the page badge reads **Detectors online** once the worker has loaded the models.

- Set `MML_DETECTOR_BACKEND=stub` in `backend/.env` to skip the model download and get fixed scores, which is handy for UI work.
- The worker uses `--pool=solo`: one process and no `fork()`. That avoids macOS fork-safety crashes and saves memory. Celery's time limits don't apply in this mode.
- One worker serves every queue, so the models load once (~2.5 GB). While a video runs, image and audio requests wait their turn.

## How it fits together

`nginx` serves the React app and proxies `/api` to a FastAPI process. That process never loads a model: it validates uploads and enqueues Celery tasks on Redis.
- `worker-fast` handles images and audio. The API waits for these and replies within 30 s.
- `worker-video` handles videos. The browser polls the job until it is done.

Results and heatmaps stay in PostgreSQL and on the upload volume for 7 days. Uploads are deleted as soon as their task ends.

## Develop

Backend:

```bash
cd backend && pip install -r requirements.txt -r requirements-dev.txt
pytest -q && ruff check app tests scripts && mypy app
```

Frontend:

```bash
cd frontend && npm ci && npm run dev
```

See [`CLAUDE.md`](CLAUDE.md) for the architecture rules, the API contract and the privacy rules. The full design is in the *Production Backend Design* doc.

## Licences

The image detector is CC BY-NC 3.0 and the face model is published for research and education. This is non-commercial coursework and must not be offered as a commercial service.
