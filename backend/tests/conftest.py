import pytest
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from backend.database import Base


class _MockAsyncSessionCtx:
    """Wraps a test AsyncSession as an async context manager."""

    def __init__(self, session: AsyncSession):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, *args):
        pass


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
async def db_session(db_engine):
    """
    Provides an in-memory test session AND patches async_session in every route
    module that imports it, so all API endpoints see the same test session.
    """
    import backend.database as database_mod
    import backend.routes.public as public_mod
    import backend.routes.results as results_mod
    import backend.routes.settings as settings_mod
    import backend.routes.plans as plans_mod

    session_factory = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:

        def ctx():
            return _MockAsyncSessionCtx(session)

        # Patch async_session at the source AND in every route module that
        # imported it via "from backend.database import async_session".
        original_db = database_mod.async_session
        original_public = public_mod.async_session
        original_results = results_mod.async_session
        original_settings = settings_mod.async_session
        original_plans = plans_mod.async_session

        database_mod.async_session = ctx
        public_mod.async_session = ctx
        results_mod.async_session = ctx
        settings_mod.async_session = ctx
        plans_mod.async_session = ctx

        yield session

        database_mod.async_session = original_db
        public_mod.async_session = original_public
        results_mod.async_session = original_results
        settings_mod.async_session = original_settings
        plans_mod.async_session = original_plans
