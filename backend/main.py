import logging
from collections import deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
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


# Serve frontend static files
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")
