import pytest
import hashlib
from unittest.mock import AsyncMock
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from httpx import AsyncClient, ASGITransport

from backend.models.base import Base
import backend.database as database_mod
from backend.models import User
from backend.auth import hash_password
from sqlalchemy import select


@pytest.fixture(autouse=True)
def _disable_scheduler(monkeypatch):
    """Disable scheduler during tests to prevent background tasks from hanging DB teardown."""
    import backend.services.scheduler as scheduler_mod

    monkeypatch.setattr(scheduler_mod, "start_scheduler", lambda: None)
    monkeypatch.setattr(scheduler_mod, "shutdown_scheduler", lambda: None)
    monkeypatch.setattr(
        scheduler_mod, "sync_scheduled_jobs", AsyncMock(return_value=None)
    )


@pytest.fixture(autouse=True)
def _reset_login_rate_limit():
    """Reset login rate limiter between tests."""
    from backend.auth import reset_rate_limit

    reset_rate_limit()
    yield
    reset_rate_limit()


@pytest.fixture
async def db_engine():
    import os

    # Default to SQLite memory for local speed, allow override for CI/matrix
    db_url = os.getenv("TEST_DATABASE_URL")
    if not db_url:
        db_url = "sqlite+aiosqlite:///:memory:"

    # Handle PostgreSQL URL conversion if needed (sqlalchemy requires +asyncpg)
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    engine = create_async_engine(db_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def db_session(db_engine, monkeypatch):
    """
    Provides an in-memory test session AND patches engine/async_session globally.
    """
    import backend.routes.public as public_mod
    import backend.routes.results as results_mod
    import backend.routes.settings as settings_mod
    import backend.routes.plans as plans_mod
    import backend.auth as auth_mod

    session_factory = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )

    def get_test_session():
        return session_factory()

    # Patch engine AND async_session at the source
    monkeypatch.setattr(database_mod, "engine", db_engine)
    monkeypatch.setattr(database_mod, "async_session", get_test_session)

    # Patch in all modules that have already imported them
    monkeypatch.setattr(public_mod, "async_session", get_test_session)
    monkeypatch.setattr(results_mod, "async_session", get_test_session)
    monkeypatch.setattr(settings_mod, "async_session", get_test_session)
    monkeypatch.setattr(plans_mod, "async_session", get_test_session)
    monkeypatch.setattr(auth_mod, "async_session", get_test_session)

    async with session_factory() as session:
        yield session


@pytest.fixture
async def auth_client(db_session):
    from backend.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        pw_hash = hashlib.sha256("testpass".encode()).hexdigest()
        result = await db_session.execute(
            select(User).where(User.username == "testadmin")
        )
        existing = result.scalar_one_or_none()
        if not existing:
            db_session.add(
                User(username="testadmin", password_hash=hash_password(pw_hash))
            )
            await db_session.commit()

        await client.post(
            "/api/auth/login", json={"username": "testadmin", "password": pw_hash}
        )
        yield client
