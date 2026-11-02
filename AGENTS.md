# Project rules
- Read docs/SPEC.md before any task.
- Frontend: React + Vite + TypeScript + Tailwind. Backend: FastAPI + SQLModel.
- Pose runs in the browser with MediaPipe Pose Landmarker. Never send video to the server.
- All rep-counting and form logic = pure TypeScript functions in frontend/src/engine/, no React or DOM imports, so they are unit-testable.
- Exercises are configs (see SPEC), never hardcoded in the state machine.
- Write Vitest tests for every engine function. Run them before saying a task is done.
- One phase at a time. Do not implement features from later phases.