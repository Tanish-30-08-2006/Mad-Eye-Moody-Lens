FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MML_DETECTOR_BACKEND=stub \
    MML_STORAGE_BACKEND=local \
    MML_STORAGE_ROOT=/tmp/uploads \
    MML_TMP_DIR=/tmp/mml \
    MML_EXT_DATA_DIR=/tmp/reddit \
    NUMBA_CACHE_DIR=/tmp/numba \
    XDG_CACHE_HOME=/tmp/.cache \
    MPLCONFIGDIR=/tmp/mpl

# Install ffmpeg for audio/video processing and curl for healthchecks
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libglib2.0-0 libgomp1 curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (CPU torch)
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

COPY functional-ui-models-backend/backend/requirements.txt .
RUN pip install -r requirements.txt

# Copy application code
COPY functional-ui-models-backend/backend/app ./app
COPY functional-ui-models-backend/backend/migrations ./migrations
COPY functional-ui-models-backend/backend/alembic.ini .
COPY functional-ui-models-backend/backend/scripts ./scripts
COPY reddit_extension/backend/moody_lens_ext ./moody_lens_ext
COPY start_render.sh ./start_render.sh

RUN sed -i 's/\r$//' ./start_render.sh \
 && chmod +x ./start_render.sh \
 && useradd --create-home --uid 10001 mml \
 && mkdir -p /tmp/uploads /tmp/reddit /tmp/mml \
 && chown -R mml:mml /app /tmp

USER mml
EXPOSE 8000

CMD ["./start_render.sh"]