# Deployment Guide (100% Free Tier Architecture)

This guide walks you through deploying **AI Gym Coach** to production on the web completely for free (\$0/month) using free tiers on Vercel, Render, Supabase/Neon, and Google Gemini.

```
┌────────────────────────────────┐          ┌───────────────────────────────────┐
│     Vercel (Frontend SPA)      │          │      Render (Backend FastAPI)     │
│  - Free HTTPS (camera allowed) │ ───────> │  - Free Web Service (/health)     │
│  - MediaPipe runs in browser   │          │  - Python 3.11 + SQLModel         │
└────────────────────────────────┘          └───────────────────────────────────┘
                                                              │
                                            ┌─────────────────┴─────────────────┐
                                            ▼                                   ▼
                             ┌────────────────────────────┐      ┌────────────────────────────┐
                             │    Neon / Supabase ($0)    │      │ Google Gemini Flash ($0)   │
                             │  - Free Serverless Postgres│      │  - 1,500 free requests/day │
                             │  - Stores workouts/replays │      │  - Rule fallback if capped │
                             └────────────────────────────┘      └────────────────────────────┘
```

---

## 1. Prerequisites (Free Accounts)
1. **GitHub Account**: Your repository pushed to GitHub.
2. **Vercel Account**: [vercel.com](https://vercel.com) (Free Hobby tier).
3. **Render Account**: [render.com](https://render.com) (Free tier).
4. **Google Gemini API Key**: [aistudio.google.com](https://aistudio.google.com) (Free Tier, 15 RPM / 1,500 RPD, no credit card required).
5. **(Recommended) Neon or Supabase**: [neon.tech](https://neon.tech) or [supabase.com](https://supabase.com) (Free Serverless Postgres tier).

---

## 2. Deploying the Backend (Render)

Render hosts the FastAPI backend server and connects to the database.

### Step 2.1: Create Render Web Service
1. Log in to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** > **Web Service**.
3. Select **Build and deploy from a Git repository** and connect your `gym-coach` repository.
4. Fill in the service settings:
   * **Name**: `gym-coach-backend`
   * **Region**: `Oregon (US West)` or `Frankfurt (EU Central)` *(See Gemini Region Note below)*
   * **Root Directory**: `backend`
   * **Runtime**: `Python 3`
   * **Build Command**: `pip install -r requirements.txt`
   * **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   * **Instance Type**: **Free** (\$0/month)

### Step 2.2: Configure Environment Variables in Render
Scroll down to the **Environment Variables** section and add the following keys:

| Key | Example Value | Description |
| :--- | :--- | :--- |
| `PYTHON_VERSION` | `3.11.9` | Matches pinned Python version. |
| `ALLOWED_ORIGINS` | `https://your-frontend.vercel.app` | Comma-separated allowed frontend URLs (update after Vercel deploy). |
| `GEMINI_API_KEY` | `AIzaSy...` | Your Google Gemini API key from Google AI Studio. |
| `LLM_PROVIDER` | `gemini` | Primary AI coaching provider. |
| `LLM_MODEL` | `gemini-1.5-flash` | Fast, high-accuracy, 100% free model. |
| `DATABASE_URL` | `postgresql://user:pass@host/db?sslmode=require` | *(Optional)* Neon/Supabase Postgres connection string. If unset, uses default SQLite. |
| `DEVICE_DAILY_QUOTA_REPORTS`| `5` | Maximum AI reports per device per day. |
| `GLOBAL_DAILY_QUOTA_REPORTS`| `100` | Maximum total AI reports across all users per day. |
| `RATE_LIMIT_WRITES_PER_MINUTE` | `60` | Max write requests/minute per device. |

> [!NOTE]
> **Gemini Region Note**: Google AI Studio Gemini API is available globally across 180+ regions. If using a Render region, Oregon (US) or Frankfurt (EU) work reliably.

### Step 2.3: Verify Backend Deployment
1. Click **Create Web Service**.
2. Once Render finishes building, note your backend URL (e.g. `https://gym-coach-backend.onrender.com`).
3. Verify in your browser: open `https://gym-coach-backend.onrender.com/health`.
   * Expected output: `{"status": "ok"}`

---

## 3. Persistent Database Setup (Neon / Supabase)

Render's free tier has an ephemeral disk that resets when the container restarts. To persist user workouts permanently across restarts for free:

1. Create a free database at [neon.tech](https://neon.tech).
2. Copy the connection string (format: `postgresql://[user]:[password]@[endpoint].neon.tech/[dbname]?sslmode=require`).
3. In your Render dashboard, navigate to **Environment** > Add `DATABASE_URL` with your connection string.
4. Render will automatically redeploy and initialize all tables and indexes.

---

## 4. Deploying the Frontend (Vercel)

Vercel provides free HTTPS, which is **mandatory** for browsers to permit webcam access.

### Step 4.1: Import Project into Vercel
1. Log in to [vercel.com](https://vercel.com) and click **Add New...** > **Project**.
2. Select your `gym-coach` GitHub repository.
3. In the configuration screen:
   * **Project Name**: `gym-coach`
   * **Framework Preset**: `Vite`
   * **Root Directory**: Click *Edit* and select `frontend`.
   * **Build Command**: `npm run build`
   * **Output Directory**: `dist`
   * **Install Command**: `npm install` (or `npm ci`)

### Step 4.2: Configure Build Environment Variables
In the **Environment Variables** section on Vercel, add:
* **Key**: `VITE_API_URL`
* **Value**: Your Render backend URL without trailing slash (e.g. `https://gym-coach-backend.onrender.com`).

### Step 4.3: Deploy and Lock CORS
1. Click **Deploy**. Vercel will build and deploy the React bundle in ~40 seconds.
2. Note your production Vercel URL (e.g. `https://gym-coach.vercel.app`).
3. **Important**: Go back to your Render Dashboard > **Environment** > Update `ALLOWED_ORIGINS` to include your new Vercel URL:
   ```text
   https://gym-coach.vercel.app,http://localhost:5173
   ```
4. Click **Save Changes** in Render.

---

## 5. Security & Camera Permissions Verification

* **Camera Permissions Policy**: Vercel and Nginx configs automatically include the header:
  ```http
  Permissions-Policy: camera=(self)
  ```
  This guarantees modern mobile Chrome and iOS Safari grant webcam access without permission rejection.
* **HTTPS Requirement**: Vercel automatically issues an SSL certificate for all deployments. The browser will prompt for camera access upon clicking **Start Camera**.

---

## 6. Health Checks & Rollback

### Health Monitoring
* Check backend status anytime at `GET /health`:
  ```bash
  curl -i https://gym-coach-backend.onrender.com/health
  ```
  Returns `HTTP 200 {"status": "ok"}`.

### Instant Rollback
* **Vercel**: In the Vercel dashboard under **Deployments**, click the `...` menu next to any previous deployment and select **Promote to Production** for instant zero-downtime rollback.
* **Render**: Under **Events** / **Deploys**, click **Rollback to this deploy** on any previously working build.
