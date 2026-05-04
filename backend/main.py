import logging
from collections import deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.middleware.sessions import SessionMiddleware
from loguru import logger
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

log_buffer: deque[str] = deque(maxlen=500)

LOG_FORMAT = "{time:YYYY-MM-DD HH:mm:ss} {level} [{name}] {message}"


class InterceptHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno
        frame, depth = logging.currentframe(), 2
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1
        logger.opt(depth=depth, exception=record.exc_info).log(
            level, record.getMessage()
        )


def sink_buffer(message):
    log_buffer.append(message)


def setup_logging():
    logger.remove()

    logger.add(
        sink_buffer,
        format=LOG_FORMAT,
        level="INFO",
    )
    logger.add(
        lambda m: print(m, end=""),
        format=LOG_FORMAT,
        level="INFO",
    )

    logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
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
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY, max_age=86400 * 7)
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


frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    index_file = frontend_dist / "index.html"

    app.mount(
        "/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets"
    )

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if not full_path:
            return FileResponse(str(index_file))

        try:
            base_path = frontend_dist.resolve()

            safe_path = full_path.lstrip("/")
            target_path = (base_path / safe_path).resolve()

            if target_path.is_relative_to(base_path) and target_path.is_file():
                return FileResponse(str(target_path))
        except (ValueError, RuntimeError):
            pass

        return FileResponse(str(index_file))
