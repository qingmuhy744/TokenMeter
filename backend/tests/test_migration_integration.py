import pytest
import os
from sqlalchemy import create_engine, select
from backend.models import User, Setting, TokenPlan, TestResult
from backend.migrations.manager import migrate_sqlite_to_pg
from backend.database import Base, async_sessionmaker, AsyncSession


@pytest.mark.asyncio
async def test_sqlite_to_pg_migration_integrity(db_engine):
    """Test that data is correctly moved from SQLite to PG."""
    db_url = os.getenv("TEST_DATABASE_URL", "")
    if "postgresql" not in db_url:
        pytest.skip(
            "This test requires a real PostgreSQL database in TEST_DATABASE_URL"
        )

    # 1. Create a temporary SQLite database with data
    sqlite_path = "test_migration_source.db"
    if os.path.exists(sqlite_path):
        os.remove(sqlite_path)

    sync_sqlite_engine = create_engine(f"sqlite:///{sqlite_path}")
    # Use sync metadata create for sqlite
    Base.metadata.create_all(sync_sqlite_engine)

    from sqlalchemy.orm import sessionmaker

    SqliteSession = sessionmaker(sync_sqlite_engine)
    with SqliteSession() as s:
        s.add(User(username="testuser", password_hash="hash"))
        s.add(Setting(key="test_key", value="test_value"))
        s.add(
            TokenPlan(
                name="Plan 1",
                api_type="openai",
                api_base="http://test",
                api_key="key",
                model="m",
            )
        )
        s.commit()

    # 2. Run the migration
    # db_engine is already connected to our target PG test db (cleaned by conftest)
    pg_url = db_url

    # We need to ensure the target PG has the schema but is empty
    # db_engine fixture already did Base.metadata.create_all

    success = migrate_sqlite_to_pg(
        sqlite_path, pg_url, [User, Setting, TokenPlan, TestResult]
    )
    assert success is True

    # 3. Verify data in PG
    async_session = async_sessionmaker(db_engine, class_=AsyncSession)
    async with async_session() as session:
        # Check User
        res = await session.execute(select(User).where(User.username == "testuser"))
        user = res.scalar_one()
        assert user.password_hash == "hash"

        # Check Setting
        res = await session.execute(select(Setting).where(Setting.key == "test_key"))
        sett = res.scalar_one()
        assert sett.value == "test_value"

        # Check TokenPlan
        res = await session.execute(select(TokenPlan).where(TokenPlan.name == "Plan 1"))
        plan = res.scalar_one()
        assert plan.api_key == "key"

    # Cleanup
    if os.path.exists(sqlite_path):
        os.remove(sqlite_path)


@pytest.mark.asyncio
async def test_migration_transaction_idempotency(db_engine):
    """Test that migrations handle 'already exists' errors without aborting transactions."""
    db_url = os.getenv("TEST_DATABASE_URL", "")
    if "postgresql" not in db_url:
        pytest.skip("PostgreSQL specific transaction behavior test")

    async_session = async_sessionmaker(db_engine, class_=AsyncSession)
    async with async_session() as session:
        # 1. Force version to 0.0.0 so migrations attempt to run
        # First ensure Setting table exists and version is 0.0.0
        res = await session.execute(select(Setting).where(Setting.key == "db_version"))
        s = res.scalar_one_or_none()
        if s:
            s.value = "0.0.0"
        else:
            session.add(Setting(key="db_version", value="0.0.0"))
        await session.commit()

        # 2. Run migrations
        # The db_engine already has the latest columns because Base.metadata.create_all ran.
        # So run_migrations will hit "duplicate column" errors.
        # We want to ensure it completes successfully and updates the version.
        from backend.migrations.manager import run_migrations

        await run_migrations(session)

        # 3. Verify version was updated despite "errors"
        res = await session.execute(select(Setting).where(Setting.key == "db_version"))
        s = res.scalar_one()
        from backend.migrations.manager import MIGRATIONS

        latest = MIGRATIONS[-1][0]
        assert s.value == latest
