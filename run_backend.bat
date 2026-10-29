@echo off
echo ========================================================
echo Starting Multimodal Deepfake Detection Studio - Backend
echo ========================================================
cd /d "%~dp0backend"

if not exist ".env" (
    if exist "..\.env" (
        copy /Y "..\.env" ".env" >nul
    ) else (
        copy /Y "..\.env.example" ".env" >nul
    )
)

echo Starting FastAPI server on http://localhost:8000
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
pause
