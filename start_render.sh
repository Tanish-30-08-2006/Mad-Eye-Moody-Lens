#!/bin/bash
set -e

# Run database migrations
python -m alembic upgrade head

# Start Celery worker in the background (using solo pool for minimal memory)
celery -A app.worker.celery_app worker \
  -Q inference.fast,inference.video,maintenance \
  --concurrency=1 \
  --pool=solo \
  -n worker@%h \
  --loglevel=INFO &

# Start the Web API on Render's assigned PORT
exec gunicorn app.main:app \
  -k uvicorn.workers.UvicornWorker \
  -w 1 \
  -b 0.0.0.0:${PORT:-8000} \
  --timeout 120