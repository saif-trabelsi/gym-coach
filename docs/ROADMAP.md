# Roadmap

## Status (the agent updates this column only after I confirm a task)
5.4 Replay viewer: DONE
R.1 Report reliability: DONE
D.1 Design system and app shell: DONE
D.2 Coach screen redesign: TODO
D.3 History, session detail, report card and replay restyle: TODO
D.4 Progress, polish, accessibility, share image: TODO
D.5 Optional: full UI translation EN/FR/AR with RTL: TODO (only if I ask)
6.1 Evaluation: TODO
6.2 Per-device privacy and quotas: TODO
6.3 Docker: TODO
6.4 Deploy: TODO
6.5 README, CI and demo video kit: TODO
Order: 5.4, D.1, D.2, D.3, D.4, (D.5), 6.1, 6.2, 6.3, 6.4, 6.5.

## Design direction (applies to all D tasks)
Dark sports-tech look as default, light theme as a toggle (system preference on first visit). Near-black slate background, subtle borders, soft depth. ONE accent color (emerald) for primary actions, plus semantic score colors used identically everywhere (good 85 or more, warn 70 to 84, bad under 70). Big numerals for reps and score, circular score ring. Glass panels over the video for the live HUD. One variable font (Inter via an npm package, no CDN). Consistent spacing scale and radii. Skeleton loaders instead of spinners where content shape is known. Calm, professional, no emoji in the UI chrome (use an icon set from an npm package such as lucide-react, justified in the plan).

## 5.4 Replay viewer (verify, implement only if missing)
Canvas player in the session detail for each set that has a rep with has_replay, fetched lazily from GET /reps/{id}/replay and cached. Position-based playback (decimal frame index advanced by dt x fps x speed, dt capped at 100 ms, animation loop fully stopped while paused or unmounted). Speeds 0.25x, 0.5x, 1x, loop, restart, scrubber that pauses while dragged, space and arrow keys, Smooth toggle (3 frame moving average ignoring nulls, input never mutated), highlighted joints red and larger, bones red when both ends highlighted, bones with a null end skipped, x flipped when mirrored, connection list and colors imported from the live overlay, aspect ratio kept, devicePixelRatio handled, opens paused under prefers-reduced-motion, only one player open at a time, 404 shows "Replay unavailable", network error shows Retry. Tests: advance (0 to 15 at 15 fps, 0.25x gives 3.75, clamp at last frame, loop wrap, dt cap), speed change without jump, smoothing, projectFrame mirrored, visibleSegments, component states, rAF stopped when paused.

## D.1 Design system and app shell
- frontend/src/design/tokens.css with CSS variables for dark and light, mapped in the Tailwind theme. Dark default, light, system. Persist in localStorage inside try/catch. No flash of the wrong theme (inline script in index.html sets the theme before first paint).
- Inter variable font via an npm package, with a system font fallback stack.
- Kit in frontend/src/ui/kit/: Button (primary, secondary, ghost, danger, sizes, loading state), Card, Badge (neutral, success, warning, danger, info), SegmentedControl, Tabs, StatTile, ScoreRing (SVG, animated, aria-label "Score 87 out of 100"), Skeleton, EmptyState, ErrorState (with retry), Toast system (aria-live polite), Dialog (focus trap, ESC, overlay click, restores focus), Spinner. Pure helper scoreTone(score): 85 and above "good", 70 to 84 "warn", below 70 "bad", used everywhere.
- App shell: header with wordmark, navigation (Coach, History, Progress), backend status pill, theme toggle. Main landmark, skip link, restyled offline banner, footer. Under 640 px the navigation becomes a bottom tab bar.
- A "#design" style guide view listing every component and state in both themes, available only in development builds.
- Existing screens keep working. Restyle only the shell now, no behavior changes.
Tests: scoreTone boundaries (85 good, 84 warn, 70 warn, 69 bad), theme persistence including a throwing localStorage, Dialog focus trap and ESC and focus restore, Toast announced through aria-live, ScoreRing aria-label, Button loading blocks clicks, the style guide view is absent from the production build.

## D.2 Coach screen redesign (presentation only, pipeline untouched, FPS must not drop)
- Video stage as hero with glass HUD overlays: exercise and state chip top left, large rep counter bottom left (bump animation on increment), ScoreRing for the last rep top right, live feedback toast bottom center (large text, icon, color by severity).
- Side panel on desktop and bottom sheet on mobile: workout panel (current set, finished sets, End set, Finish and save, Discard with Dialog confirmation, retry on failed save), last 10 reps as compact score chips with expandable metrics.
- Exercise selector as two large cards (icon, name, camera placement hint).
- Before the camera starts: onboarding state with an SVG silhouette showing the side view, a checklist (full body visible, side-on, camera at hip height for squat and chest height for curl, good light) and a large Start camera button. Camera permission denied state with instructions. Model loading skeleton with a clear message.
- FPS and GPU or CPU badge small and collapsible. Angle debug plot moved under a collapsed "Developer tools" section. Compact voice toolbar (mute, language).
- All live behavior identical: counts, scores, messages, highlights, recording.
Tests: component states (idle onboarding, permission denied, loading, running), HUD shows values from props, severity to color mapping, workout panel buttons enabled and disabled rules, rep counter animation skipped under reduced motion. Compare FPS before and after on the same clip and report it.

## D.3 History, session detail, report card and replay restyle
- History: cards grouped by day with relative dates ("Today", "Yesterday", then absolute) via a pure helper tested with a fixed clock, exercise chips, small ScoreRing, duration. Filter chips (exercise, date range). Skeleton list, EmptyState with a link to Coach, delete through a menu and Dialog confirmation.
- Session detail: summary header (date, duration, totals, average ring). Sections: Coaching report, Sets.
- Report card restyle: typographic hierarchy, stat tiles, issue cards with severity icon, next steps as a checklist, badges for AI-written versus template, language selector as SegmentedControl with check marks, Arabic RTL polished (logical CSS properties), cooldown countdown, copy button.
- Sets: each set a card with the fatigue chart (theme-aware colors from tokens, subtle gradient area, average line, styled tooltip), summary tiles (reps, average, best, worst, form drop with trend), rep table with score pills and violation chips, prominent Replay button.
- Replay panel restyle: pill control bar, segmented speed control, styled scrubber, keyboard hints.
- Chart theme: one helper providing colors from CSS variables to Recharts, no hardcoded hex.
Tests: relative date helper (Today, Yesterday, 3 days ago, older absolute), filters, Dialog behavior, chart helper reads token values, report card states still pass.

## D.4 Progress, polish, accessibility, share image
- Progress: KPI tiles with deltas versus the previous equal period (pure helper, tested), consistent charts, SegmentedControl for range, EmptyState with a call to action.
- Subtle page transitions and micro-interactions, all disabled under prefers-reduced-motion. A proper not-found view for unknown routes.
- SVG favicon, document title per view, meta description, theme-color, Open Graph and Twitter card image (static 1200x630 PNG committed in public/).
- React.lazy for History, Progress and charts.
- Targets on the production build (npm run build, npm run preview), measured with Lighthouse: Performance 90 or more, Accessibility 95 or more, Best Practices 95 or more, SEO 90 or more. Report the real scores and fix what is under target.
- Keyboard-only walkthrough of every screen, contrast AA check in both themes, document any known exception.
- Optional small feature: "Print or save as PDF" for a session report with print CSS.
Tests: delta helper, route fallback, title updates per view.

## D.5 Optional: UI translation EN/FR/AR with RTL
Translation dictionaries for all UI text, language switcher in the header persisted in localStorage, html lang and dir updated, logical CSS properties (start and end) everywhere, Intl for numbers and dates, voice language linked to the UI language. Tests: every key exists in all three languages, dir switches to rtl for Arabic, no hardcoded user-facing strings in components (a test scanning the ui folder with a small allowlist).

## 6.1 Evaluation
Goal: honest numbers for the README. Use the SAME engine code on real recorded landmarks.
- Dev-only "Export landmarks" button in video-file mode: records per frame the timestamp, normalized landmarks (x, y, z, visibility) and world landmarks, and downloads a JSON file. Not shown in production builds.
- eval/PROTOCOL.md: filming protocol (side view, distance, camera height, lighting, different clothing and different people with their consent, 10 to 15 sets per exercise, deliberate faults for every rule, a few clean sets), labeling guide, and a split into a tuning set and a held-out test set (thresholds may be tuned only on the tuning set, results are reported on the held-out set).
- eval/labels/<clip>.json: exercise, true rep count, per rep list of faults (rule ids).
- eval/run.ts (run with a documented command, for example npx tsx): feeds each landmark JSON through the engine headlessly and writes eval/results.json and eval/results.md with: rep count mean absolute error and exact match rate, per rule precision, recall and F1 at rep level, a confusion table, number of clips and reps, and the limitations (small sample, few people).
- Raw videos are NEVER committed (privacy), only landmark JSON and labels, and a small synthetic fixture set is committed for tests.
- A Vitest test runs the evaluation on the committed fixtures and asserts the metrics code with hand computed expected values (for example 10 reps counted as 9 gives MAE 1; a rule fired on 3 reps of which 2 are true and 4 true faults exist gives precision 0.667 and recall 0.5).
- No change to engine behavior. If tuning on the tuning set suggests different thresholds, report them and ask me before changing any config.

## 6.2 Per-device privacy and quotas
- Anonymous device token: the frontend creates crypto.randomUUID() once, stores it in localStorage (try/catch, in-memory fallback), and sends it in the header X-Device-Id on every request.
- Backend: every session belongs to a device. Add a device_id column to the sessions table with a SAFE startup migration (check PRAGMA table_info, ALTER TABLE ADD COLUMN device_id TEXT NOT NULL DEFAULT 'legacy', plus an index). All session, report, replay and stats endpoints are scoped to the device. Another device's data answers 404, never 403. Validate the header format (UUID v4), missing or invalid header gives 400.
- Report generation quotas against LLM spending: per device daily cap and a global daily cap from environment variables. When exceeded, return the template fallback with fallback_reason "quota_exceeded" and add the matching label in the frontend.
- Privacy controls: "Export my data" (JSON download) and "Delete all my data" (with Dialog confirmation) in the UI, backed by endpoints scoped to the device.
- ALLOWED_ORIGINS from environment, CORS allowing the X-Device-Id header.
- Document honestly in the README: the token is a bearer secret, not authentication.
Tests: device A cannot read, list, delete or generate reports for device B's sessions, replays or stats (404), invalid header, migration test on a database file created with the OLD schema (data still readable under "legacy", column present, no data loss), quota behavior with injected clock, CORS preflight with the new header, export and delete endpoints, and all previous tests updated to send the header.

## 6.3 Docker
- backend/Dockerfile (python slim, non-root user, pinned requirements, uvicorn, healthcheck on /health), frontend/Dockerfile (multi-stage: node build, then nginx serving the static files with SPA fallback, gzip, cache headers, security headers including Permissions-Policy camera=(self)), .dockerignore files, docker-compose.yml with a named volume for the SQLite data, env_file for backend secrets, VITE_API_URL as a build argument, healthchecks and a sensible start order.
- One command: docker compose up --build. The app reachable on localhost (the camera works on localhost).
- scripts/smoke.ps1: brings the stack up, waits for health, posts a sample session, reads it back, brings the stack down, and exits non-zero on failure.
- No secrets in images or in git. Document usage in the README. If Docker is not installed in my environment, say so and give me the exact verification steps.

## 6.4 Deploy
- Support DATABASE_URL (default SQLite, Postgres supported with a driver). The UTC datetime handling must work on both, add tests that run on SQLite and document how to run them against Postgres.
- Config files: render.yaml (or the chosen backend host equivalent), vercel.json (SPA rewrites, security headers incl. Permissions-Policy camera=(self)), documented environment variables (GEMINI_API_KEY, LLM_PROVIDER, LLM_MODEL, LLM_FALLBACK_MODELS, ALLOWED_ORIGINS, DATABASE_URL, quota caps).
- docs/DEPLOY.md: step by step with exact clicks for the frontend on Vercel or Netlify (HTTPS is required for the camera) and the backend on Render, Fly or Railway, persistence (Postgres or a persistent volume, free tiers may wipe local disk), the Gemini region note (requests come from the backend host region), how to set secrets, how to check /health, rollback.
- Production hardening: request size limit kept, rate limiting per device on write endpoints, structured logging without secrets, no debug mode, CORS locked to the real frontend origin.
I perform the account steps, the agent produces files and instructions.

## 6.5 README, CI and demo video kit
- README: hero GIF placeholder, one line pitch, features, architecture diagram in Mermaid, stack table, how it works (pipeline, config-driven engine, rules and scoring, fatigue, replay, LLM report with fallback), privacy (no video leaves the browser, replay is skeleton only, device token), evaluation results table from 6.1 with limitations, run locally (dev.ps1 and Docker), live demo link, project structure, design decisions and lessons, known limitations, license (MIT), a clear "demo data" disclosure if seeded data is shown.
- .github/workflows/ci.yml: on push and pull request run backend pytest, frontend vitest and build, with caching, plus README badges.
- docs/DEMO_SCRIPT.md: a 60 second storyboard (shots, on-screen text, order: live squat with feedback, fatigue curve, replay at 0.25x with red joint, AI report, progress page, architecture slide) and a checklist for filming.
- LICENSE file. A final pass listing anything left in the repo that should not be public (keys, personal data, large files).
