# AI Gym Coach - 60-Second Demo Video Kit & Storyboard

This document is your filming and recording guide for shooting a clean, high-impact **60-second video showcase** of the AI Gym Coach application for YouTube, Twitter/X, LinkedIn, or portfolio demos.

---

## 🎬 Storyboard (Total Runtime: 60 Seconds)

| Time | Scene / Shot | Action & Screen Content | Spoken Voiceover / On-Screen Text |
| :--- | :--- | :--- | :--- |
| **0:00 - 0:08** | **Hook & Onboarding** | Show the clean sports-tech landing screen. Select **Squat** card. Show the setup checklist (side-on, good lighting). Click **"Start Camera"**. | *"Meet AI Gym Coach: real-time biomechanical workout coaching running 100% in your browser with zero video ever uploaded."* |
| **0:08 - 0:22** | **Live Reps & Audio Feedback** | Stand in profile view. Perform Rep 1 (clean squat, 95 score, green ring). Perform Rep 2 (deliberately shallow squat: knee angle stays high). HUD turns red, audio announces: *"Sink hips lower"*, and knee joint highlights in red. | *"As you squat, MediaPipe tracks 33 joints in real-time. Hit proper depth, and your rep is counted. Cut it shallow, and instant audio coaching tells you to sink deeper."* |
| **0:22 - 0:34** | **Fatigue Drift & Replay** | Click **"End Set"**. In the Session Detail view, show the interactive fatigue chart with downward trend line. Click **`[▶ Replay]`** on Rep #2. Switch playback speed to **0.25x**. | *"Every rep tracks fatigue and cadence. And unlike generic counters, you can replay ANY repetition at 0.25x speed with your faulty joint highlighted in red."* |
| **0:34 - 0:46** | **AI Coaching Report** | Click **"Generate Coaching Report"**. The AI Report Card displays strengths, faults, and actionable next steps powered by Google Gemini 1.5 Flash. | *"When your workout finishes, Google Gemini analyzes your biomechanics to generate structured coaching insights and actionable cues for your next session."* |
| **0:46 - 0:54** | **Progress Dashboard** | Click the **Progress** tab. Scroll through KPI tiles (Total Workouts, Average Score with +3.2 delta, Reps Over Time area chart). | *"Track your form consistency, volume, and score improvements across weeks with detailed progress analytics."* |
| **0:54 - 1:00** | **Mobile & Privacy Outro** | Show the app running on mobile (or responsive mobile viewport). Highlight PWA home-screen icon and privacy badge. | *"100% private, free to use, and mobile ready. Built with React, MediaPipe, FastAPI, and Google Gemini."* |

---

## 📋 Filming Preparation Checklist

### 1. Camera & Space Setup
- [ ] **Camera Placement**: Position webcam or phone at **hip height** (for squats) or **chest height** (for bicep curls).
- [ ] **Side-On Angle**: Align the camera exactly perpendicular (profile view). Avoid extreme 45° diagonal angles.
- [ ] **Full Body Visibility**: Ensure head, hips, knees, and ankles are clearly visible in the frame when standing and at the bottom of the squat.
- [ ] **Lighting**: Soft, front/overhead light. Avoid heavy backlighting (e.g. standing directly in front of a bright window).
- [ ] **Clothing**: Form-fitting or athletic clothing (avoids baggy fabric obscuring knee and elbow joint positions).

### 2. Audio & Environment Setup
- [ ] Turn up system audio so the browser's speech synthesis ("Good rep", "Sink hips lower") is clearly picked up in the microphone recording.
- [ ] Ensure quiet room acoustics.

### 3. Screen Recording Setup
- [ ] Resolution: 1920x1080 (1080p) or 3840x2160 (4K) at 60 FPS.
- [ ] Browser window: Fullscreen (press `F11`) or clean borderless window.
- [ ] Close unnecessary browser tabs and notification popups.
- [ ] Seed fresh demo sessions (`python backend/scripts/seed_demo.py`) before filming so the **History** and **Progress** tabs are fully populated with rich analytics and charts.
