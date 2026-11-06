# AI Gym Coach

Computer-vision powered real-time rep counter and form coach running in the browser with MediaPipe Pose Landmarker, paired with a FastAPI backend for history, progress analytics, and AI coaching reports.

## Quick Start (Development)

To launch both the backend and frontend development servers in separate PowerShell windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev.ps1
```

This script validates that `backend/.venv` exists, prints the URLs, and starts:
- **Backend API**: http://127.0.0.1:8000 (Swagger UI at http://127.0.0.1:8000/docs)
- **Frontend App**: http://localhost:5173

## Manual Setup & Run

### Backend
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Run tests:
```powershell
pytest
```

### Frontend
```powershell
cd frontend
npm install
npm run dev
```
Run tests:
```powershell
npx vitest run
```
