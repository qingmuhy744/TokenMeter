import logging
import textwrap
from sqlalchemy import select, text
from backend.models import Setting

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
    current = await get_current_version(db)
    logger.info(f"Current database version: {current}")

    for version, mtype, content in MIGRATIONS:
        if version > current:
            logger.info(f"Applying migration to {version}...")
            if mtype == "sql":
                # Split by semicolon and run each statement
                # Simple split is fine for basic migrations
                for stmt in content.split(";"):
                    stmt = stmt.strip()
                    if stmt:
                        try:
                            await db.execute(text(stmt))
                        except Exception as e:
                            # Ignore errors like "duplicate column" which might happen
                            # if migrations were partially applied or manually run
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
