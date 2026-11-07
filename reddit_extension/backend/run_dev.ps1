# run_dev.ps1 – Launches the host backend API with reddit_extension/backend in PYTHONPATH.
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$HostBackend = Join-Path $RepoRoot "functional-ui-models-backend\backend"
$ExtBackend = Join-Path $RepoRoot "reddit_extension\backend"

Write-Host "Entering host backend at: $HostBackend"
Set-Location $HostBackend

if ($env:PYTHONPATH) {
    $env:PYTHONPATH = "$ExtBackend;$($env:PYTHONPATH)"
} else {
    $env:PYTHONPATH = "$ExtBackend"
}
Write-Host "PYTHONPATH=$env:PYTHONPATH"

$VenvPy = Join-Path $HostBackend ".venv\Scripts\python.exe"
$PythonExe = if (Test-Path $VenvPy) { $VenvPy } else { "python" }

Write-Host "Starting uvicorn via $PythonExe..."
& $PythonExe -m uvicorn app.main:app --reload --reload-dir app --port 8000
