from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.db import init_db
from app.routes.reports import router as reports_router
from app.routes.reps import router as reps_router
from app.routes.sessions import router as sessions_router
from app.routes.stats import router as stats_router

MAX_REQUEST_BODY_SIZE = 2 * 1024 * 1024  # 2 MB


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="AI Gym Coach API", lifespan=lifespan)

app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions_router)
app.include_router(reports_router)
app.include_router(stats_router)
app.include_router(reps_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
