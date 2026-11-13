import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.db import init_db
from app.routes.device import router as device_router
from app.routes.reports import router as reports_router
from app.routes.reps import router as reps_router
from app.routes.sessions import router as sessions_router
from app.routes.stats import router as stats_router

MAX_REQUEST_BODY_SIZE = 2 * 1024 * 1024  # 2 MB
RATE_LIMIT_WRITES_PER_MINUTE = int(os.getenv("RATE_LIMIT_WRITES_PER_MINUTE", "60"))


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > MAX_REQUEST_BODY_SIZE:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "Request entity too large. Maximum size is 2 MB."},
                    )
            except ValueError:
                pass

        body = await request.body()
        if len(body) > MAX_REQUEST_BODY_SIZE:
            return JSONResponse(
                status_code=413,
                content={"detail": "Request entity too large. Maximum size is 2 MB."},
            )

        return await call_next(request)


class PerDeviceRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_writes_per_minute: int = RATE_LIMIT_WRITES_PER_MINUTE):
        super().__init__(app)
        self.max_writes_per_minute = max_writes_per_minute
        self.device_timestamps = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        # Apply rate limiting to mutating/write endpoints
        if request.method in ("POST", "PUT", "DELETE") and request.url.path != "/health":
            now = time.time()
            device_id = request.headers.get("x-device-id")
            if not device_id:
                client_host = request.client.host if request.client else "unknown"
                device_id = f"ip:{client_host}"

            timestamps = self.device_timestamps[device_id]
            # Prune timestamps older than 60 seconds
            while timestamps and now - timestamps[0] > 60:
                timestamps.popleft()

            if len(timestamps) >= self.max_writes_per_minute:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded. Too many write requests. Please try again later."},
                    headers={"Retry-After": "60"},
                )

            timestamps.append(now)

        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="AI Gym Coach API",
    lifespan=lifespan,
    debug=os.getenv("DEBUG", "false").lower() == "true",
)

raw_allowed_origins = os.getenv("ALLOWED_ORIGINS", "").strip()
if raw_allowed_origins:
    allowed_origins = [orig.strip() for orig in raw_allowed_origins.split(",") if orig.strip()]
else:
    allowed_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(PerDeviceRateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-Device-Id"],
)

app.include_router(sessions_router)
app.include_router(reports_router)
app.include_router(stats_router)
app.include_router(reps_router)
app.include_router(device_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
