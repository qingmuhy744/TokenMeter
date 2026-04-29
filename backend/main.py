import logging
from collections import deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.middleware.sessions import SessionMiddleware
from pathlib import Path

from backend.config import settings
from backend.database import init_db
from backend.auth import router as auth_router, ensure_admin, get_current_user
from backend.routes.plans import router as plans_router
from backend.routes.results import router as results_router
from backend.routes.settings import router as settings_router
from backend.services.scheduler import start_scheduler, shutdown_scheduler, sync_scheduled_jobs

# In-memory log buffer (last 500 lines)
log_buffer: deque[str] = deque(maxlen=500)


class BufferHandler(logging.Handler):
    def emit(self, record):
        log_buffer.append(self.format(record))


def setup_logging():
    fmt = "%(asctime)s %(levelname)s [%(name)s] %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"

    root = logging.getLogger()
    root.setLevel(logging.INFO)

    # Console handler
    console = logging.StreamHandler()
    console.setFormatter(logging.Formatter(fmt, datefmt=datefmt))
    root.addHandler(console)

    # Buffer handler for API access
    buf = BufferHandler()
    buf.setFormatter(logging.Formatter(fmt, datefmt=datefmt))
    root.addHandler(buf)


setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await ensure_admin()
    await sync_scheduled_jobs()
    start_scheduler()
    logger.info("TokenMeter started")
    yield
    shutdown_scheduler()


app = FastAPI(title="TokenMeter", lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)
app.include_router(auth_router)
app.include_router(plans_router)
app.include_router(results_router)
app.include_router(settings_router)


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
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Try to serve the exact file first (e.g. favicon.svg)
        file_path = frontend_dist / full_path
        if full_path and file_path.is_file():
            return FileResponse(str(file_path))
        # Fallback to index.html for all SPA routes
        return FileResponse(str(index_file))
