#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

echo "========================================================"
echo "Launching Multimodal Deepfake Detection Studio"
echo "========================================================"

# Backend setup
cd "$DIR/backend"
if [ ! -f ".env" ]; then
    cp ../.env.example .env
fi

if [ ! -d ".venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
else
    source .venv/bin/activate
fi

echo "Starting Backend on http://localhost:8000..."
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!

# Frontend setup
cd "$DIR/frontend"
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

echo "Starting Frontend on http://localhost:5173..."
npm run dev &
FRONTEND_PID=$!

cleanup() {
    echo "Stopping services..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait
