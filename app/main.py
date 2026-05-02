"""FastAPI application entry point: lifespan, middleware, and router registration."""

import warnings

# Must be first: sentry-sdk calls asyncio.iscoroutinefunction() (deprecated in Python ≥3.14)
# during import-time instrumentation. With PYTHONWARNINGS=error this crashes before any
# FastAPI middleware is active. The filter must precede all other imports.
warnings.filterwarnings("ignore", message=".*asyncio.iscoroutinefunction.*")

import logging
import sys
import time
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.db.base import engine
from app.db.models import Base  # noqa: F401
from app.game.ws import router as game_router
from app.routers.auth import router as auth_router
from app.routers.rankings import router as rankings_router
from app.routers.rooms import router as rooms_router

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
# Keep SQLAlchemy query echo only when explicitly needed — it's too noisy for normal debug sessions
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)
logger.info("Starting — debug=%s python=%s", settings.debug, sys.version.split()[0])


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run DB migrations on startup and dispose engine on shutdown."""
    logger.info("Starting up — running DB migrations")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("DB ready")
    yield
    await engine.dispose()
    logger.info("Shutdown complete")


app = FastAPI(
    title="421",
    docs_url="/docs" if settings.debug else None,
    redoc_url=None,
    lifespan=lifespan,
)

if settings.sentry_dsn:
    sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.2)
    logger.info("Sentry enabled")
else:
    logger.info("Sentry disabled (no DSN configured)")

if settings.debug:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.middleware("http")
async def catch_exceptions_middleware(request: Request, call_next):
    """Log and return JSON 500 for any unhandled exception."""
    try:
        return await call_next(request)
    except Exception as exc:
        logger.exception("Unhandled error %s %s", request.method, request.url.path)
        sentry_sdk.capture_exception(exc)
        body = str(exc) if settings.debug else "Internal server error"
        return JSONResponse(status_code=500, content={"detail": body})


@app.middleware("http")
async def access_log(request: Request, call_next):
    """Log every HTTP request with method, path, status code, and duration."""
    start = time.perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        return response
    finally:
        ms = (time.perf_counter() - start) * 1000
        logger.info("%-6s %-50s → %d  (%.0fms)", request.method, request.url.path, status, ms)


@app.get("/healthz", include_in_schema=False)
async def healthz():
    """Health check endpoint for container orchestration liveness probes."""
    return {"status": "ok"}


# game_router last: it contains GET /{full_path:path} which would shadow all routes below it
app.include_router(auth_router)
app.include_router(rankings_router)
app.include_router(rooms_router)
app.include_router(game_router)
