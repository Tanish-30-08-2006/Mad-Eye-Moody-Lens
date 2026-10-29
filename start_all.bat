@echo off
echo ========================================================
echo Launching Multimodal Deepfake Detection Studio
echo ========================================================
echo.
echo 1. Starting Backend (FastAPI on http://localhost:8000)...
start "Deepfake Detection - Backend" cmd /k "cd /d %~dp0 && run_backend.bat"

timeout /t 3 /nobreak >nul

echo 2. Starting Frontend (React on http://localhost:5173)...
start "Deepfake Detection - Frontend" cmd /k "cd /d %~dp0 && run_frontend.bat"

echo.
echo ========================================================
echo Both services are starting in separate windows!
echo - API Docs: http://localhost:8000/api/docs
echo - Web App:  http://localhost:5173
echo ========================================================
echo.
pause
