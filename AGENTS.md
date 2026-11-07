# Project rules
- Read docs/SPEC.md before any task.
- Frontend: React + Vite + TypeScript + Tailwind. Backend: FastAPI + SQLModel.
- Pose runs in the browser with MediaPipe Pose Landmarker. Never send video to the server.
- All rep-counting and form logic = pure TypeScript functions in frontend/src/engine/, no React or DOM imports, so they are unit-testable.
- Exercises are configs (see SPEC), never hardcoded in the state machine.
- Write Vitest tests for every engine function. Run them before saying a task is done.
- One phase at a time. Do not implement features from later phases.

## Project overview
AI Gym Coach: real-time squat and bicep curl coaching in the browser. Pose estimation runs in the browser (MediaPipe Pose Landmarker). The backend (FastAPI + SQLModel + SQLite) stores workouts, generates coaching reports (Gemini with a template fallback) and stores worst-rep skeleton replays.
Layout: frontend/ (React, Vite, TypeScript, Tailwind, Vitest, Recharts), backend/ (FastAPI, pytest, venv in backend/.venv), docs/, scripts/ (dev.ps1, seed_demo.py, sample_replay.py, check_llm.py if present), eval/ (later).
docs/ROADMAP.md is the single source of truth for what to build next.

## Commands (Windows PowerShell)
Backend tests: cd backend ; .\.venv\Scripts\python.exe -m pytest
Frontend tests: cd frontend ; npx vitest run
Frontend build check: cd frontend ; npm run build
Run everything: powershell -ExecutionPolicy Bypass -File scripts\dev.ps1
Leak check before any commit: git grep -n -E "AIza|AQ\.[A-Za-z0-9_-]{20,}|GEMINI_API_KEY="  (must print nothing except placeholder lines in .env.example)

## Hard rules
- Squat and bicep curl live behavior is validated by the user and FROZEN. Never change engine logic, thresholds, rules, scoring, the feedback manager or voice unless a task explicitly says so. The squat regression test must stay green.
- frontend/src/engine is pure TypeScript (no React, no DOM). Exercises are configs, never hardcoded in the state machine.
- One clock: frames and reps use the timestamp the engine receives.
- Data contracts: rep timestamp = integer epoch milliseconds (Date.now()). Session and set times = UTC ISO strings ending in Z, and the backend always returns UTC with a trailing Z. A replay = 33 landmarks as [x, y] per frame, never images. Reps expose has_replay, replay data only via GET /reps/{id}/replay. Reports are cached per (session, language): POST and GET /sessions/{id}/report, GET /sessions/{id}/reports.
- The LLM never decides facts: numbers are computed by the backend, the LLM only writes text, its output is validated, and a template fallback always exists. Never log or return secrets. .env is never committed.
- SQLite: create_all does not alter existing tables. Never add a column to an existing table without a startup migration that checks PRAGMA table_info.
- No new dependency without a one line justification in the plan. No external CDN assets at runtime (fonts come from npm packages).
- UI: once D.1 exists, all colors, spacing and radii come from design tokens (no hardcoded hex in components). Accessible by default: keyboard operable, visible focus ring, aria labels, contrast AA, prefers-reduced-motion respected. Every async view has loading, empty and error states. Reuse frontend/src/feedback/messages.ts for rule labels.
- Never run git commit or git push. The user commits. Always run the leak check and report its output.

## Task protocol
1. Read AGENTS.md and the task in docs/ROADMAP.md. Work on exactly ONE task and do not start later ones.
2. Planning mode: produce a plan listing files to create or change and confirm nothing out of scope is touched.
3. Implement with tests (Vitest, pytest). Put new logic in pure functions where possible.
4. Run all backend and frontend tests and the frontend build. Fix failures properly. Never weaken or delete a test to make it pass.
5. Final report: test counts compared to before, git diff --stat with scope confirmation, a table of acceptance criteria (expected versus actual), manual verification steps for me (exact commands and what I should see), assumptions made, leak check output, suggested commit message.
6. Stop and wait for my message before the next task.
If a requirement is ambiguous or conflicts with these rules, ask before implementing.
If a browser agent is available, capture screenshots of the affected screens at 1440, 768 and 390 pixels width and attach them to the final report (design tasks).
