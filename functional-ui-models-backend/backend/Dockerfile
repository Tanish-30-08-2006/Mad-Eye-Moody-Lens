# syntax=docker/dockerfile:1.4
# One image for every backend role; the compose command picks the role:
#   api          gunicorn app.main:app -k uvicorn.workers.UvicornWorker (ONE worker, see CMD)
#   worker-fast  celery -A app.worker.celery_app worker -Q inference.fast
#   worker-video celery -A app.worker.celery_app worker -Q inference.video,maintenance
#   beat         celery -A app.worker.celery_app beat
#
# The Reddit extension API (reddit_extension/backend/moody_lens_ext) is mounted into the
# same FastAPI app. It comes in through the named build context `reddit`
# (docker-compose.prod.yml: build.additional_contexts). Building by hand:
#   (from functional-ui-models-backend/)  docker build --build-context reddit=../reddit_extension/backend -t mml-backend backend
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# ffmpeg: audio extraction + ffprobe validation; libglib/libgomp: OpenCV + PyTorch CPU.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libglib2.0-0 libgomp1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU-only PyTorch first, so pip never pulls the multi-GB CUDA build (no GPU on the laptop).
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY migrations ./migrations
COPY alembic.ini .
COPY scripts ./scripts
# Reddit extension API: pure Python on the host's dependencies; the API refuses to start
# with MML_BRAIN=host if it is missing, so the image must always carry it.
COPY --from=reddit moody_lens_ext ./moody_lens_ext

# Model caches live on a volume; workers never download at runtime.
ENV HF_HOME=/models/hf \
    TORCH_HOME=/models/torch \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    MML_TMP_DIR=/tmp/mml \
    MML_STORAGE_ROOT=/data/uploads \
    MML_EXT_DATA_DIR=/data/reddit-extension \
    NUMBA_CACHE_DIR=/tmp/numba \
    XDG_CACHE_HOME=/tmp/.cache \
    MPLCONFIGDIR=/tmp/mpl
# ^ librosa's numba JIT and other libraries cache on disk; the containers run
#   read_only, so every cache points at the /tmp tmpfs.

# Non-root user; the upload, model and Reddit verdict-cache volumes are created owned by it.
RUN useradd --create-home --uid 10001 mml \
 && mkdir -p /models /data/uploads /data/reddit-extension /tmp/mml \
 && chown -R mml:mml /models /data /tmp/mml
USER mml

EXPOSE 8000
# ONE worker on purpose: the Reddit extension API keeps its job map (job-... ids) in process
# memory, so a submit on one worker polled on another would 404. The API never runs a model
# (blocking waits go to the thread pool), so one async worker is enough for the laptop demo.
CMD ["gunicorn", "app.main:app", "-k", "uvicorn.workers.UvicornWorker", "-w", "1", "-b", "0.0.0.0:8000", \
     "--timeout", "90", "--graceful-timeout", "30", "--access-logfile", "-"]
