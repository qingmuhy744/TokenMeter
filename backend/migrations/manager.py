import logging
import textwrap
import os
from sqlalchemy import create_engine, select, text, inspect
from sqlalchemy.orm import sessionmaker
from backend.models import Setting, User, TokenPlan, TestResult
from backend.config import settings

logger = logging.getLogger(__name__)

# List of migrations to run.
# Each entry is (version, type, content)
# type can be 'sql' or 'func'
MIGRATIONS = [
    (
        "0.1.0",
        "sql",
        textwrap.dedent("""
        ALTER TABLE test_results ADD COLUMN input_tokens INTEGER;
        ALTER TABLE test_results ADD COLUMN cache_read INTEGER;
        ALTER TABLE test_results ADD COLUMN char_count INTEGER;
        ALTER TABLE test_results ADD COLUMN token_density FLOAT;
    """).strip(),
    ),
]


def migrate_sqlite_to_pg(sqlite_path, pg_url, models):
    """Synchronous migration helper for row-by-row copy."""
    # Use sync engines for simpler row-by-row iteration
    sync_sqlite = create_engine(f"sqlite:///{sqlite_path}")
    sync_pg = create_engine(
        pg_url.replace("postgresql+asyncpg://", "postgresql+psycopg://")
    )

    SqliteSession = sessionmaker(sync_sqlite)
    PgSession = sessionmaker(sync_pg)

    with SqliteSession() as src, PgSession() as dst:
        logger.info("Starting SQLite to PostgreSQL migration...")

        for model in models:
            table_name = model.__tablename__
            logger.info(f"Copying table: {table_name}")

            # Get columns present in SQLite
            inspector = inspect(sync_sqlite)
            existing_columns = [
                col["name"] for col in inspector.get_columns(table_name)
            ]

            # Dynamically build select statement to only include columns present in SQLite
            # and that exist in the SQLAlchemy model
            selectable_columns = [
                model.__table__.c[col_name]
                for col_name in existing_columns
                if col_name in model.__table__.c
            ]

            if not selectable_columns:
                logger.warning(
                    f"No selectable columns found for {table_name}, skipping."
                )
                continue

            # Execute the dynamic select
            rows = src.execute(select(*selectable_columns)).all()
            if not rows:
                continue

            mappings = [dict(row._mapping) for row in rows]

            # Clear target table just in case
            dst.execute(text(f"TRUNCATE TABLE {table_name} CASCADE"))

            # Bulk insert
            dst.execute(model.__table__.insert(), mappings)

            # Reset identity sequence for PostgreSQL
            if "id" in [c.name for c in model.__table__.columns]:
                try:
                    dst.execute(
                        text(
                            f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), COALESCE(MAX(id), 1), true) FROM {table_name}"
                        )
                    )
                except Exception as e:
                    logger.warning(f"Could not reset sequence for {table_name}: {e}")

        dst.commit()
        logger.info("Migration successful.")
    return True


async def get_current_version(db):
    """Get current database version from settings table."""
    try:
        result = await db.execute(select(Setting).where(Setting.key == "db_version"))
        setting = result.scalar_one_or_none()
        if setting:
            return setting.value
        return "0.0.0"
    except Exception:
        # Table might not exist yet
        return "0.0.0"


async def set_current_version(db, version):
    """Update database version in settings table."""
    result = await db.execute(select(Setting).where(Setting.key == "db_version"))
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = version
    else:
        db.add(Setting(key="db_version", value=version))


async def run_migrations(db):
    """Run all pending migrations."""
    # 0. Identify latest version
    latest_version = MIGRATIONS[-1][0] if MIGRATIONS else "0.0.0"

    # 1. Handle SQLite -> PG Migration if needed
    migration_performed = False
    if "postgresql" in settings.database_url and os.path.exists(settings.DB_PATH):
        # Double check if PG is empty by checking if there are any users
        try:
            result = await db.execute(select(User))
            if result.first() is None:
                logger.info(
                    "PostgreSQL detected and empty, and SQLite file exists. Triggering migration."
                )
                try:
                    migrate_sqlite_to_pg(
                        settings.DB_PATH,
                        settings.database_url,
                        [User, Setting, TokenPlan, TestResult],
                    )
                    # Cleanup
                    os.remove(settings.DB_PATH)
                    logger.info(f"Removed old SQLite file: {settings.DB_PATH}")
                    migration_performed = True
                except Exception as e:
                    logger.error(f"Migration failed: {e}")
        except Exception as e:
            logger.warning(f"Could not check for empty PG database: {e}")

    # 2. Run existing schema migrations
    current = await get_current_version(db)
    logger.info(f"Current database version: {current}")

    # Special case: If this is a fresh install (version 0.0.0) AND no SQLite migration was performed,
    # it means Base.metadata.create_all already created the latest schema.
    # We should just mark it as the latest version.
    if current == "0.0.0" and not migration_performed:
        # Check if we have any data/tables. If we have tables but version is 0.0.0,
        # it's either a fresh install or a legacy DB without versioning.
        # For this project, we assume fresh install if version is 0.0.0.
        logger.info(f"Fresh installation detected, setting version to {latest_version}")
        await set_current_version(db, latest_version)
        await db.commit()
        return

    for version, mtype, content in MIGRATIONS:
        if version > current:
            logger.info(f"Applying migration to {version}...")
            if mtype == "sql":
                for stmt in content.split(";"):
                    stmt = stmt.strip()
                    if stmt:
                        try:
                            # Use a sub-transaction if possible, or just catch and handle
                            # For simple migrations, we'll try-catch.
                            # On PostgreSQL, a failure aborts the transaction.
                            await db.execute(text(stmt))
                        except Exception as e:
                            if "postgresql" in settings.database_url:
                                # Rollback to clear the aborted state
                                await db.rollback()

                            if (
                                "duplicate column" in str(e).lower()
                                or "already exists" in str(e).lower()
                            ):
                                logger.warning(
                                    f"Column already exists in {version}, skipping: {stmt}"
                                )
                            else:
                                raise e

            await set_current_version(db, version)
            await db.commit()
            logger.info(f"Successfully migrated to {version}")
