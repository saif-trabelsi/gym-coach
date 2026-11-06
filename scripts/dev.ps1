$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir

# 1. Check that backend/.venv exists
$venvPath = Join-Path $rootDir "backend\.venv"
if (-not (Test-Path $venvPath)) {
    Write-Host "Error: backend/.venv was not found at $venvPath." -ForegroundColor Red
    Write-Host "Please create the virtual environment first:" -ForegroundColor Yellow
    Write-Host "  cd backend" -ForegroundColor Yellow
    Write-Host "  python -m venv .venv" -ForegroundColor Yellow
    Write-Host "  .\.venv\Scripts\pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}

# 2. Print both URLs
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Starting AI Gym Coach Dev Servers   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backend API:  http://127.0.0.1:8000 (docs at http://127.0.0.1:8000/docs)" -ForegroundColor Green
Write-Host "Frontend App: http://localhost:5173" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

# 3. Open backend in a new PowerShell window
$backendCmd = "Set-Location '$rootDir\backend'; & '.\.venv\Scripts\Activate.ps1'; uvicorn app.main:app --port 8000"
Start-Process powershell.exe -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $backendCmd

# 4. Open frontend in a new PowerShell window
$frontendCmd = "Set-Location '$rootDir\frontend'; npm run dev"
Start-Process powershell.exe -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $frontendCmd

Write-Host "Launched backend and frontend servers in separate windows." -ForegroundColor Green
