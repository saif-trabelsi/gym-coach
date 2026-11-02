# AI Gym Coach: Specification

## 1. Goal
A web app that analyzes a person doing squats and bicep curls from a webcam or an uploaded video. It counts reps, scores form, gives live visual and voice feedback, saves sessions, and produces an LLM-written coaching report. It must be demoable live and deployable as a public demo.

## 2. Scope v1
Exercises: squat (side view) and bicep curl (front or side view). Everything is config-driven so that new exercises can be added without changing the engine.

## 3. Key architecture decision
Pose estimation runs in the browser. No video is ever sent to a server. The backend only stores sessions and generates reports.

## 4. Tech stack
- Pose: MediaPipe Pose Landmarker (@mediapipe/tasks-vision, JS/WASM), model "full", GPU delegate with CPU fallback, running mode VIDEO. Use world landmarks (3D, meters) for angles.
- Frontend: React + Vite + TypeScript + Tailwind CSS. Tests with Vitest. Charts with Recharts.
- Overlay: HTML canvas over the video element.
- Voice: Web Speech API.
- Backend: FastAPI + SQLModel (SQLite in dev, Postgres in prod).
- LLM: any LLM API, called from the backend only, with structured stats as input.
- Deploy: Docker, frontend on Vercel or Netlify, backend on Render or Fly.

## 5. Browser pipeline
Camera or video file -> PoseLandmarker -> Smoother (One Euro filter) -> Feature extractor (angles, normalized distances) -> Exercise engine (state machine + rules) -> Feedback manager (overlay + voice) -> Session recorder -> API.

Accuracy rules:
- Compute angles from world landmarks, not pixel coordinates.
- Smooth landmarks with a One Euro filter.
- Ignore landmarks with visibility below about 0.5. If key landmarks are not visible, pause feedback and show "step back, full body in frame".
- Normalize distances by torso length so thresholds work for any body size and camera distance.

## 6. Exercise engine
The engine lives in frontend/src/engine/ as pure TypeScript functions. No React, no DOM, no camera access. This makes it unit-testable with synthetic data.

Each exercise is a config object: view, signal (which angle), states (up and down thresholds with hysteresis), rules (form checks with message and severity).

Rep counting: state machine idle -> descending -> bottom -> ascending, with hysteresis thresholds and a minimum rep duration to reject noise. A half rep must not count.

Each rep stores: min angle, max angle, duration, violations list, score from 0 to 100 (100 minus weighted penalties), timestamp.

Feedback manager: one message at a time, cooldown of about 3 seconds, priority by severity.

### Squat (side view)
- Signal: knee angle (hip, knee, ankle).
- States: up when angle > 160, down when angle < 100.
- Rules: depth (min knee angle < 100 at bottom, message "Go lower"), back (torso lean under 45 degrees from vertical, message "Keep your chest up"), tempo (descent longer than 0.8 s, message "Slow down").

### Bicep curl (front or side view)
- Signal: elbow angle (shoulder, elbow, wrist).
- States: down when angle > 160, up when angle < 50.
- Rules: extension (reaches above 160 at the bottom, message "Fully extend"), elbow drift (under 0.15 x torso length, message "Pin your elbow"), swing (shoulder and hip horizontal sway under a threshold, message "Don't swing").

## 7. Backend
Data model: Session -> Set -> Rep. A rep has score, min_angle, max_angle, duration, violations, timestamp.

Endpoints:
- POST /sessions
- GET /sessions
- GET /sessions/{id}
- GET /stats/progress
- POST /sessions/{id}/report

LLM report: send only structured stats (reps per set, average score, most frequent violations, form drop from first to last rep). Ask for a summary, the top 2 issues, and advice for the next session. Training form advice only, no medical claims.

## 8. Differentiators
1. Fatigue curve: score per rep across a set.
2. Worst-rep replay: replay the skeleton of the lowest-scoring rep with the faulty joint in red.
3. Evaluation: film 10 to 15 labeled sets, report rep-count error and form-fault precision and recall in the README.
4. Video file mode: analyze an uploaded video with the same engine.

## 9. Repo structure
```
gym-coach/
  frontend/src/
    pose/      (detector.ts, smoothing.ts)
    engine/    (features.ts, stateMachine.ts, exercises/squat.ts, exercises/bicepCurl.ts)
    feedback/  (manager.ts, voice.ts)
    ui/        (Camera, VideoFileInput, Overlay, SessionSummary, Dashboard)
  backend/app/ (main.py, models.py, routes/, llm.py)
  eval/        (labeled videos, notebook, metrics)
  docs/        (SPEC.md)
  docker-compose.yml
  README.md
```

## 10. Roadmap
- Phase 1: foundation.
  - Task 1.1: Vite + React + TS + Tailwind scaffold, Camera component, VideoFileInput, pose detector module, skeleton Overlay, FPS counter.
  - Task 1.2: engine only, no UI. Angle computation, One Euro filter, visibility filter, torso normalization, rep state machine with hysteresis. Vitest tests with synthetic angle sequences.
  - Task 1.3: squat config plugged into the engine, live rep counter and knee angle on screen, debug panel plotting the angle signal.
- Phase 2: squat form rules, feedback manager, voice.
- Phase 3: bicep curl using only a config.
- Phase 4: FastAPI + DB, session saving, dashboard, fatigue curve.
- Phase 5: LLM report, worst-rep replay.
- Phase 6: evaluation, Docker, deploy, README, demo video.

## 11. Risks
- Camera placement: show an on-screen guide for side or front view.
- Threshold tuning: provide a debug view that plots the angle signal live.
- Squat knee-cave needs a front view, so it is out of scope for v1.