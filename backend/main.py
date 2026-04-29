from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from pathlib import Path

from backend.config import settings
from backend.database import init_db
from backend.auth import router as auth_router, ensure_admin
from backend.routes.plans import router as plans_router
from backend.routes.results import router as results_router
from backend.routes.settings import router as settings_router
from backend.services.scheduler import start_scheduler, shutdown_scheduler, sync_scheduled_jobs


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await ensure_admin()
    await sync_scheduled_jobs()
    start_scheduler()
    yield
    shutdown_scheduler()


app = FastAPI(title="TokenMeter", lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)
app.include_router(auth_router)
app.include_router(plans_router)
app.include_router(results_router)
app.include_router(settings_router)

# Serve frontend static files
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")
