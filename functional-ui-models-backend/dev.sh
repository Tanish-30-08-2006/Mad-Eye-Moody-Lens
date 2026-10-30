#!/usr/bin/env bash
# Local development launcher (macOS / Linux). Run from ANY folder:
#
#   ./dev.sh setup     once: virtualenv, Python + npm packages, backend/.env, database
#   ./dev.sh redis     terminal 1
#   ./dev.sh worker    terminal 2  (loads the models; first start downloads them)
#   ./dev.sh api       terminal 3  (http://localhost:8000/docs)
#   ./dev.sh web       terminal 4  (http://localhost:5173)
#   ./dev.sh check     is everything ready?
#
# Why a script: Celery and uvicorn only find the `app` package when started inside
# backend/, and they must run with backend/.venv's Python, not the system one.
# This script always does both, whatever folder you are in.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV_PY="$BACKEND/.venv/bin/python"

need_venv() {
  if [ ! -x "$VENV_PY" ]; then
    echo "No virtualenv at backend/.venv yet. Run:  ./dev.sh setup" >&2
    exit 1
  fi
  if [ ! -f "$BACKEND/.env" ]; then
    echo "backend/.env is missing. Run:  cp backend/.env.dev.example backend/.env" >&2
    exit 1
  fi
  # python.org's macOS Python ships no CA certificates for urllib, so torch.hub's
  # face-weights download fails with CERTIFICATE_VERIFY_FAILED. Use certifi's bundle.
  if [ -z "${SSL_CERT_FILE:-}" ]; then
    SSL_CERT_FILE="$("$VENV_PY" -c 'import certifi; print(certifi.where())' 2>/dev/null || true)"
    if [ -n "$SSL_CERT_FILE" ]; then export SSL_CERT_FILE; else unset SSL_CERT_FILE; fi
  fi
}

pick_python() {
  # Prefer 3.12 (widest ML wheel support), then 3.11, then 3.13.
  for v in python3.12 python3.11 python3.13; do
    if command -v "$v" >/dev/null 2>&1; then command -v "$v"; return; fi
  done
  echo "Python 3.11+ not found. Install it with:  brew install python@3.12" >&2
  exit 1
}

case "${1:-}" in
  setup)
    PYBIN="$(pick_python)"
    echo "Creating backend/.venv with $PYBIN"
    "$PYBIN" -m venv "$BACKEND/.venv"
    "$VENV_PY" -m pip install --upgrade pip
    "$VENV_PY" -m pip install torch torchvision
    "$VENV_PY" -m pip install -r "$BACKEND/requirements.txt"
    [ -f "$BACKEND/.env" ] || cp "$BACKEND/.env.dev.example" "$BACKEND/.env"
    (cd "$BACKEND" && "$VENV_PY" -m alembic upgrade head)
    (cd "$FRONTEND" && npm install)
    for tool in redis-server ffmpeg ffprobe node; do
      command -v "$tool" >/dev/null 2>&1 || echo "Missing $tool. Install with:  brew install redis ffmpeg node"
    done
    echo "Setup done. Now start: ./dev.sh redis | worker | api | web (one per terminal)."
    ;;
  redis)
    exec redis-server
    ;;
  worker)
    need_venv
    cd "$BACKEND"
    # --pool=solo: one process, no fork() (avoids macOS fork-safety crashes, saves RAM).
    exec "$VENV_PY" -m celery -A app.worker.celery_app worker \
      -Q inference.fast,inference.video,maintenance --pool=solo -n dev@%h --loglevel=INFO
    ;;
  api)
    need_venv
    cd "$BACKEND"
    (cd "$BACKEND" && "$VENV_PY" -m alembic upgrade head >/dev/null)  # cheap; no-op when up to date
    # --reload-dir app: watch only our code, not .venv or the uploads folder.
    exec "$VENV_PY" -m uvicorn app.main:app --reload --reload-dir app --port 8000
    ;;
  web)
    cd "$FRONTEND"
    [ -d node_modules ] || npm install
    exec npm run dev
    ;;
  check)
    curl -s http://localhost:8000/api/v1/ready || echo "API is not running on :8000"
    echo
    ;;
  *)
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
