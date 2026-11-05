#!/usr/bin/env bash
# run_dev.sh – Launches the host backend API with reddit_extension/backend in PYTHONPATH.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOST_BACKEND="$REPO_ROOT/functional-ui-models-backend/backend"
EXT_BACKEND="$REPO_ROOT/reddit_extension/backend"

cd "$HOST_BACKEND"

export PYTHONPATH="${EXT_BACKEND}:${PYTHONPATH:-}"
echo "PYTHONPATH set to: $PYTHONPATH"

VENV_PY="$HOST_BACKEND/.venv/bin/python"
if [ ! -x "$VENV_PY" ]; then
  VENV_PY="python3"
fi

exec "$VENV_PY" -m uvicorn app.main:app --reload --reload-dir app --port 8000
