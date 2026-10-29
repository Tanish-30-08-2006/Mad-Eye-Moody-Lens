@echo off
echo ========================================================
echo Starting Multimodal Deepfake Detection Studio - Frontend
echo ========================================================
cd /d "%~dp0frontend"

if not exist "node_modules" (
    echo node_modules not found. Running npm install...
    call npm install
)

echo Starting Vite dev server on http://localhost:5173
npm run dev
pause
