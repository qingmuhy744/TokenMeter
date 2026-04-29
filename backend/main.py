from contextlib import asynccontextmanager
from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from backend.config import settings
from backend.database import init_db
from backend.auth import router as auth_router, ensure_admin
from backend.routes.plans import router as plans_router
from backend.routes.results import router as results_router
from backend.routes.settings import router as settings_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await ensure_admin()
    yield


app = FastAPI(title="TokenMeter", lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)
app.include_router(auth_router)
app.include_router(plans_router)
app.include_router(results_router)
app.include_router(settings_router)
