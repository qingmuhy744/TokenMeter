import pytest
import os
import tempfile
from unittest.mock import patch
from sqlalchemy import create_engine, select
from backend.models import User, Setting, TokenPlan, TestResult
from backend.migrations.manager import migrate_sqlite_to_pg, run_migrations
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
async def test_run_migrations_sqlite_to_pg_e2e(db_engine):
    """End-to-end test: async session checks PG -> rollback -> sync migration.
    This simulates the real init_db() startup flow that previously caused deadlocks."""
    db_url = os.getenv("TEST_DATABASE_URL", "")
    if "postgresql" not in db_url:
        pytest.skip(
            "This test requires a real PostgreSQL database in TEST_DATABASE_URL"
        )

    # 1. Create a temporary SQLite database with data
    sqlite_fd, sqlite_path = tempfile.mkstemp(suffix=".db")
    os.close(sqlite_fd)

    sync_sqlite_engine = create_engine(f"sqlite:///{sqlite_path}")
    Base.metadata.create_all(sync_sqlite_engine)

    from sqlalchemy.orm import sessionmaker as sync_sessionmaker

    SqliteSession = sync_sessionmaker(sync_sqlite_engine)
    with SqliteSession() as s:
        s.add(User(username="e2euser", password_hash="e2ehash"))
        s.add(Setting(key="e2e_key", value="e2e_value"))
        s.add(
            TokenPlan(
                name="E2E Plan",
                api_type="openai",
                api_base="http://e2e",
                api_key="e2ekey",
                model="e2emodel",
            )
        )
        s.commit()

    # 2. Patch settings so run_migrations sees PG URL + SQLite file path
    async_session_factory = async_sessionmaker(db_engine, class_=AsyncSession)

    from backend.config import Settings

    patched_settings = Settings()
    patched_settings.DATABASE_URL = (
        db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if db_url.startswith("postgresql://")
        else db_url
    )
    patched_settings.DB_PATH = sqlite_path

    with patch("backend.migrations.manager.settings", patched_settings):
        async with async_session_factory() as db:
            # This is the exact path init_db() takes:
            # async session -> check if PG empty -> rollback -> sync migrate
            await run_migrations(db)

    # 3. Verify data was migrated to PG
    async with async_session_factory() as session:
        res = await session.execute(select(User).where(User.username == "e2euser"))
        user = res.scalar_one()
        # Password was reset by rehash_passwords_sha256 migration,
        # so it's no longer "e2ehash" but a proper bcrypt(SHA256(...)) hash
        assert user.password_hash.startswith("$2b$"), (
            "Password should be re-hashed to bcrypt format after migration"
        )

        res = await session.execute(select(Setting).where(Setting.key == "e2e_key"))
        sett = res.scalar_one()
        assert sett.value == "e2e_value"

        res = await session.execute(
            select(TokenPlan).where(
                TokenPlan.name == "E2E Plan", TokenPlan.parent_id.is_(None)
            )
        )
        plan = res.scalar_one()
        assert plan.api_key == "e2ekey"

    # 4. Verify version was updated to latest
    async with async_session_factory() as session:
        res = await session.execute(select(Setting).where(Setting.key == "db_version"))
        version_setting = res.scalar_one()
        from backend.migrations.manager import MIGRATIONS

        assert version_setting.value == MIGRATIONS[-1][0]

    # 5. Verify SQLite file was cleaned up after migration
    assert not os.path.exists(sqlite_path), (
        "SQLite file should be removed after migration"
    )

    sync_sqlite_engine.dispose()


@pytest.mark.asyncio
async def test_password_rehash_migration(db_engine):
    """Test that v0.2.0 migration resets old bcrypt(raw_password) hashes."""
    db_url = os.getenv("TEST_DATABASE_URL", "")
    if "postgresql" not in db_url:
        pytest.skip("PostgreSQL specific password hash migration test")

    import bcrypt

    async_session = async_sessionmaker(db_engine, class_=AsyncSession)

    # 1. Create a user with old-format password: bcrypt(raw_password)
    old_password = "test_old_pass"
    old_hash = bcrypt.hashpw(old_password.encode(), bcrypt.gensalt()).decode()

    async with async_session() as session:
        session.add(User(username="olduser", password_hash=old_hash))
        session.add(Setting(key="db_version", value="0.1.0"))
        await session.commit()

    # 2. Run migrations (will apply 0.2.0 rehash)
    async with async_session() as session:
        await run_migrations(session)

    # 3. Verify the password hash was reset and works with SHA256 flow
    async with async_session() as session:
        res = await session.execute(select(User).where(User.username == "olduser"))
        user = res.scalar_one()
        assert user.password_hash != old_hash, "Password hash should have been changed"
        assert user.password_hash.startswith("$2b$"), "Should still be bcrypt format"

        # Old password should NOT work (it was bcrypt(raw), now stored as bcrypt(SHA256))
        assert not bcrypt.checkpw(old_password.encode(), user.password_hash.encode()), (
            "Old raw password should not match new hash"
        )

        # Verify version is now updated
        from backend.migrations.manager import MIGRATIONS

        res = await session.execute(select(Setting).where(Setting.key == "db_version"))
        assert res.scalar_one().value == MIGRATIONS[-1][0]


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
        assert s.value >= latest


@pytest.mark.asyncio
async def test_migration_not_skipped_when_data_exists(db_session):
    """Verify that migration is NOT skipped if tables have data, even if version is 0.0.0."""
    from backend.migrations.manager import MIGRATIONS

    # 1. Setup: version 0.0.0 but has a User
    # Password is in old format (from before v0.2.0)
    db_session.add(User(username="olduser", password_hash="oldhash"))
    # Explicitly set version to 0.0.0
    res = await db_session.execute(select(Setting).where(Setting.key == "db_version"))
    s = res.scalar_one_or_none()
    if s:
        s.value = "0.0.0"
    else:
        db_session.add(Setting(key="db_version", value="0.0.0"))
    await db_session.commit()

    # 2. Run migrations
    # It should detect data (User exists) and run migrations instead of taking the shortcut.
    await run_migrations(db_session)

    # 3. Verify password was rehashed by the 0.2.0 migration
    res = await db_session.execute(select(User).where(User.username == "olduser"))
    user = res.scalar_one()
    assert user.password_hash != "oldhash", (
        "Migration should have rehashed the password"
    )
    assert user.password_hash.startswith("$2b$"), "Should be a bcrypt hash"

    # 4. Verify version was updated to latest
    res = await db_session.execute(select(Setting).where(Setting.key == "db_version"))
    version = res.scalar_one().value
    assert version >= MIGRATIONS[-1][0]


@pytest.mark.asyncio
async def test_migration_skipped_on_fresh_install(db_session):
    """Verify that migration IS skipped (shortcut taken) on a truly empty DB."""
    from backend.migrations.manager import MIGRATIONS
    from sqlalchemy import text

    # 1. Setup: Clear all tables
    await db_session.execute(text("DELETE FROM users"))
    await db_session.execute(text("DELETE FROM token_plans"))
    await db_session.execute(text("DELETE FROM test_results"))
    await db_session.execute(text("DELETE FROM settings"))
    await db_session.commit()

    # 2. Run migrations
    # It should detect NO data and take the shortcut.
    await run_migrations(db_session)

    # 3. Verify version was set to latest
    res = await db_session.execute(select(Setting).where(Setting.key == "db_version"))
    version = res.scalar_one().value
    assert version >= MIGRATIONS[-1][0]


@pytest.mark.asyncio
async def test_convert_to_suites_with_not_null_columns(db_engine):
    """Regression test: convert_to_suites must work even when NOT NULL constraints
    exist on columns that will become nullable (api_type, api_base, api_key, model).

    This simulates upgrading from v0.2.1 where those columns were NOT NULL,
    through v0.3.0 (adds parent_id), to v0.3.1+ which drops NOT NULL then
    converts plans to suites.
    """
    db_url = os.getenv("TEST_DATABASE_URL", "")
    if "postgresql" not in db_url:
        pytest.skip("This test requires PostgreSQL (NOT NULL constraint enforcement)")

    async_session_factory = async_sessionmaker(db_engine, class_=AsyncSession)

    async with async_session_factory() as session:
        # Insert plan data using ORM (handles defaults like interval_minutes)
        plan1 = TokenPlan(
            name="xiaomi",
            api_type="anthropic",
            api_base="https://api.example.com",
            api_key="sk-test-key",
            model="mimo-v2.5-pro",
            max_tokens=256,
            test_count=3,
            interval_minutes=60,
            is_active=True,
        )
        plan2 = TokenPlan(
            name="minimax",
            api_type="anthropic",
            api_base="https://api.minimax.com",
            api_key="sk-mm-key",
            model="MiniMax-M2.7",
            max_tokens=512,
            test_count=5,
            interval_minutes=30,
            is_active=True,
        )
        session.add_all([plan1, plan2])
        await session.commit()

        # Now simulate old schema: add NOT NULL constraints on columns
        # that were NOT NULL in pre-0.3.x but will become nullable
        from sqlalchemy import text

        await session.execute(
            text("ALTER TABLE token_plans ALTER COLUMN api_type SET NOT NULL")
        )
        await session.execute(
            text("ALTER TABLE token_plans ALTER COLUMN api_base SET NOT NULL")
        )
        await session.execute(
            text("ALTER TABLE token_plans ALTER COLUMN api_key SET NOT NULL")
        )
        await session.execute(
            text("ALTER TABLE token_plans ALTER COLUMN model SET NOT NULL")
        )
        await session.execute(
            text("ALTER TABLE token_plans ALTER COLUMN max_tokens SET NOT NULL")
        )
        await session.execute(
            text("ALTER TABLE token_plans ALTER COLUMN test_count SET NOT NULL")
        )
        # Set version to 0.2.1 so migrations from 0.3.0 onward will run
        await session.execute(
            text(
                "INSERT INTO settings (key, value) VALUES ('db_version', '0.2.1') "
                "ON CONFLICT (key) DO UPDATE SET value = '0.2.1'"
            )
        )
        await session.commit()

    # Now run migrations — this should NOT fail with NotNullViolationError
    from backend.config import Settings

    patched_settings = Settings()
    patched_settings.DATABASE_URL = (
        db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if db_url.startswith("postgresql://")
        else db_url
    )
    patched_settings.DB_PATH = "/nonexistent/path.db"

    with patch("backend.migrations.manager.settings", patched_settings):
        async with async_session_factory() as db:
            await run_migrations(db)

    # Verify: all plans have been converted to suites
    from backend.migrations.manager import MIGRATIONS

    async with async_session_factory() as session:
        res = await session.execute(select(Setting).where(Setting.key == "db_version"))
        version = res.scalar_one().value
        assert version == MIGRATIONS[-1][0], f"Expected latest version, got {version}"

        # Parent plans (suites) should have model=None
        res = await session.execute(
            select(TokenPlan).where(TokenPlan.parent_id.is_(None))
        )
        parent_plans = res.scalars().all()
        assert len(parent_plans) >= 2, f"Expected >= 2 suites, got {len(parent_plans)}"

        for parent in parent_plans:
            assert parent.model is None, (
                f"Suite '{parent.name}' should have model=None, got {parent.model}"
            )

        # Each parent should have at least one child with the actual model
        res = await session.execute(
            select(TokenPlan).where(TokenPlan.parent_id.isnot(None))
        )
        children = res.scalars().all()
        assert len(children) >= 2, f"Expected >= 2 children, got {len(children)}"

        for child in children:
            assert child.model is not None, "Child plan should have model set, got None"
