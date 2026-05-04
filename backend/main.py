import logging
from collections import deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.middleware.sessions import SessionMiddleware
from pathlib import Path

import alembic.command
import alembic.config

from backend.config import settings
from backend.auth import router as auth_router, ensure_admin, get_current_user
from backend.routes.plans import router as plans_router
from backend.routes.results import router as results_router
from backend.routes.settings import router as settings_router
from backend.routes.public import router as public_router
from backend.services.scheduler import (
    start_scheduler,
    shutdown_scheduler,
    sync_scheduled_jobs,
)

# In-memory log buffer (last 500 lines)
log_buffer: deque[str] = deque(maxlen=500)


class BufferHandler(logging.Handler):
    def emit(self, record):
        log_buffer.append(self.format(record))


class LocalTimeFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        import time

        ct = time.localtime(record.created)
        if datefmt:
            s = time.strftime(datefmt, ct)
        else:
            s = time.strftime("%Y-%m-%d %H:%M:%S", ct)
        return s


def setup_logging():
    fmt = "%(asctime)s %(levelname)s [%(name)s] %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"

    root = logging.getLogger()
    root.setLevel(logging.INFO)

    # Console handler
    console = logging.StreamHandler()
    console.setFormatter(LocalTimeFormatter(fmt, datefmt=datefmt))
    root.addHandler(console)

    # Buffer handler for API access
    buf = BufferHandler()
    buf.setFormatter(LocalTimeFormatter(fmt, datefmt=datefmt))
    root.addHandler(buf)

    # Re-enable loggers disabled by uvicorn's dictConfig(disable_existing_loggers=True)
    for name in list(logging.root.manager.loggerDict):
        logger_obj = logging.getLogger(name)
        if hasattr(logger_obj, "disabled"):
            logger_obj.disabled = False


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Configure logging after uvicorn initializes (uvicorn's dictConfig disables existing loggers)
    setup_logging()

    alembic_cfg = alembic.config.Config("alembic.ini")
    alembic.command.upgrade(alembic_cfg, "head")

    await ensure_admin()
    await sync_scheduled_jobs()
    start_scheduler()
    logger.info("TokenMeter started")
    yield
    shutdown_scheduler()


app = FastAPI(title="TokenMeter", lifespan=lifespan)
app.add_middleware(
    SessionMiddleware, secret_key=settings.SECRET_KEY, max_age=86400 * 7
)  # 7 days
app.include_router(auth_router)
app.include_router(plans_router)
app.include_router(results_router)
app.include_router(settings_router)
app.include_router(public_router)


@app.get("/api/logs")
async def get_logs(request: Request, limit: int = 100):
    await get_current_user(request)
    lines = list(log_buffer)[-limit:]
    return {"lines": lines}


# Serve frontend static files with SPA fallback
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    index_file = frontend_dist / "index.html"
    # Mount static assets (JS, CSS, images) under /assets
    app.mount(
        "/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets"
    )

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if not full_path:
            return FileResponse(str(index_file))

        try:
            # Safely resolve paths using pathlib to prevent directory traversal.
            base_path = frontend_dist.resolve()

            # Strip leading slashes to prevent pathlib from treating full_path as an absolute path,
            # which would cause it to override base_path.
            safe_path = full_path.lstrip("/")
            target_path = (base_path / safe_path).resolve()

            # The critical check: is_relative_to ensures it hasn't escaped base_path
            if target_path.is_relative_to(base_path) and target_path.is_file():
                return FileResponse(str(target_path))
        except (ValueError, RuntimeError):
            # Ignore resolution errors (e.g., malformed paths)
            pass

        # Fallback to index.html for all SPA routes
        return FileResponse(str(index_file))
