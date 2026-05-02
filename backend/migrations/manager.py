import logging
import textwrap
import os
import hashlib
import bcrypt
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
        ALTER TABLE test_results ADD COLUMN IF NOT EXISTS input_tokens INTEGER;
        ALTER TABLE test_results ADD COLUMN IF NOT EXISTS cache_read INTEGER;
        ALTER TABLE test_results ADD COLUMN IF NOT EXISTS char_count INTEGER;
        ALTER TABLE test_results ADD COLUMN IF NOT EXISTS token_density FLOAT;
    """).strip(),
    ),
    (
        "0.2.0",
        "func",
        "rehash_passwords_sha256",
    ),
    (
        "0.2.1",
        "sql",
        textwrap.dedent("""
        ALTER TABLE test_results ADD COLUMN IF NOT EXISTS ttfb_ms FLOAT;
        ALTER TABLE test_results ADD COLUMN IF NOT EXISTS ttfr_ms FLOAT;
        ALTER TABLE test_results ADD COLUMN IF NOT EXISTS think_time_ms FLOAT;
        ALTER TABLE test_results ADD COLUMN IF NOT EXISTS content_tokens INTEGER;
        ALTER TABLE test_results ADD COLUMN IF NOT EXISTS thinking_tokens INTEGER;
        ALTER TABLE test_results ADD COLUMN IF NOT EXISTS tps_content FLOAT;
        ALTER TABLE test_results ADD COLUMN IF NOT EXISTS content_char_count INTEGER;
        ALTER TABLE test_results ADD COLUMN IF NOT EXISTS thinking_char_count INTEGER;
        ALTER TABLE test_results ADD COLUMN IF NOT EXISTS ping_ms FLOAT;
        ALTER TABLE test_results ADD COLUMN IF NOT EXISTS ping_samples TEXT;
    """).strip(),
    ),
    (
        "0.3.0",
        "sql",
        textwrap.dedent("""
        ALTER TABLE token_plans ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES token_plans(id);
        ALTER TABLE token_plans ADD COLUMN IF NOT EXISTS multiplier FLOAT DEFAULT 1.0;
    """).strip(),
    ),
    (
        "0.3.1",
        "func",
        "convert_to_suites",
    ),
    (
        "0.3.2",
        "sql",
        textwrap.dedent("""
        ALTER TABLE token_plans ALTER COLUMN api_type TYPE VARCHAR(50);
    """).strip(),
    ),
    (
        "0.3.3",
        "sql",
        textwrap.dedent("""
        ALTER TABLE token_plans ALTER COLUMN max_tokens DROP NOT NULL;
        ALTER TABLE token_plans ALTER COLUMN test_count DROP NOT NULL;
    """).strip(),
    ),
    (
        "0.3.4",
        "sql",
        textwrap.dedent("""
        ALTER TABLE token_plans ALTER COLUMN api_type DROP NOT NULL;
        ALTER TABLE token_plans ALTER COLUMN api_base DROP NOT NULL;
        ALTER TABLE token_plans ALTER COLUMN api_key DROP NOT NULL;
        ALTER TABLE token_plans ALTER COLUMN model DROP NOT NULL;
    """).strip(),
    ),
    (
        "0.3.5",
        "func",
        "convert_to_suites",
    ),
]


async def convert_to_suites(db):
    """Convert all existing independent plans into suites with one child model."""
    from sqlalchemy import select, update
    from backend.models import TokenPlan, TestResult

    # 查找所有没有父级且有模型的计划
    result = await db.execute(select(TokenPlan).where(TokenPlan.parent_id.is_(None)))
    plans = result.scalars().all()

    for p in plans:
        if p.model is None:
            continue

        old_plan_id = p.id
        old_model = p.model

        # 1. 创建子模型，只设置必要的字段，其余字段保持 None 以触发继承
        child = TokenPlan(
            name=p.name,
            model=old_model,
            parent_id=old_plan_id,
            multiplier=1.0,
            is_active=p.is_active,
        )
        db.add(child)
        await db.flush()  # 获取子模型的 ID

        # 2. 将历史结果迁移到新子模型
        await db.execute(
            update(TestResult)
            .where(TestResult.plan_id == old_plan_id)
            .values(plan_id=child.id)
        )

        # 3. 将父级转化为纯套餐
        p.model = None
        # p.name 保持不变，作为套餐名

    await db.commit()


async def rehash_passwords_sha256(db):
    """Re-hash passwords from bcrypt(raw) to bcrypt(SHA256(raw)).

    Before SHA256 was added to the frontend, password hashes were bcrypt(raw_password).
    After SHA256, the login flow became: frontend sends SHA256(password) -> bcrypt.
    Old hashes stored as bcrypt(raw_password) can't be verified by bcrypt(SHA256(password)).
    Since we can't reverse bcrypt, we reset all passwords and log new setup tokens.
    """
    result = await db.execute(select(User))
    users = result.scalars().all()

    reset_count = 0
    for user in users:
        setup_token = _generate_password()
        client_hash = hashlib.sha256(setup_token.encode()).hexdigest()
        user.password_hash = bcrypt.hashpw(
            client_hash.encode(), bcrypt.gensalt()
        ).decode()
        reset_count += 1
        logger.warning(
            f"Password reset for user '{user.username}'. New setup key: {setup_token}"
        )

    if reset_count > 0:
        logger.info(
            f"Rehashed {reset_count} user(s). Check logs above for new setup keys."
        )


def _generate_password(length: int = 16) -> str:
    import secrets

    return secrets.token_urlsafe(length)[:length]


def migrate_sqlite_to_pg(sqlite_path, pg_url, models):
    """Synchronous migration helper for row-by-row copy."""
    # Use sync engines for simpler row-by-row iteration
    sync_sqlite = create_engine(f"sqlite:///{sqlite_path}")

    # Ensure we use a sync postgres driver (psycopg2) for the migration engine
    sync_pg_url = pg_url
    if sync_pg_url.startswith("postgresql+asyncpg://"):
        sync_pg_url = sync_pg_url.replace(
            "postgresql+asyncpg://", "postgresql+psycopg2://", 1
        )
    elif sync_pg_url.startswith("postgresql://"):
        sync_pg_url = sync_pg_url.replace("postgresql://", "postgresql+psycopg2://", 1)

    sync_pg = create_engine(sync_pg_url)

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
            is_empty = result.first() is None

            # CRITICAL: Close the transaction and release locks before sync migration
            await db.rollback()

            if is_empty:
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
    # We should only mark it as the latest version if there is truly no data.
    if current == "0.0.0" and not migration_performed:
        # Check if we have any data. If we have tables but version is 0.0.0,
        # it's either a fresh install or a legacy DB without versioning.
        try:
            has_data = False
            for model in [User, TokenPlan, TestResult, Setting]:
                res = await db.execute(select(model).limit(1))
                if res.first():
                    has_data = True
                    break

            if not has_data:
                logger.info(
                    f"Fresh installation detected, setting version to {latest_version}"
                )
                await set_current_version(db, latest_version)
                await db.commit()
                return
            else:
                logger.info(
                    "Legacy database detected (v0.0.0 with data). Running migrations..."
                )
        except Exception as e:
            # If check fails, play it safe and run migrations
            logger.warning(f"Data check failed, proceeding with migrations: {e}")
            try:
                await db.rollback()
            except Exception:
                pass

    # Detect database type from the session's bind
    try:
        bind = db.get_bind()
        is_pg = bind.dialect.name == "postgresql"
    except Exception:
        # Fallback to settings if bind check fails
        is_pg = "postgresql" in settings.database_url

    for version, mtype, content in MIGRATIONS:
        if version > current:
            logger.info(f"Applying migration to {version}...")
            if mtype == "sql":
                for stmt in content.split(";"):
                    stmt = stmt.strip()
                    if not stmt:
                        continue

                    # SQLite doesn't support 'IF NOT EXISTS' in ALTER TABLE ADD COLUMN.
                    # We strip it for non-PostgreSQL databases.
                    if not is_pg:
                        # SQLite doesn't support ALTER COLUMN ... TYPE.
                        # Since SQLite doesn't enforce string length limits, we can safely skip this.
                        if "ALTER COLUMN" in stmt.upper():
                            logger.warning(
                                f"Skipping ALTER COLUMN on non-PostgreSQL DB: {stmt}"
                            )
                            continue

                        # Case-insensitive removal of 'IF NOT EXISTS'
                        import re

                        stmt = re.sub(
                            r"\s+IF\s+NOT\s+EXISTS\s+",
                            " ",
                            stmt,
                            flags=re.IGNORECASE,
                        )

                    try:
                        await db.execute(text(stmt))
                    except Exception as e:
                        err_str = str(e).lower()
                        # Duplicate column error is not fatal (idempotency)
                        if "duplicate column" in err_str or "already exists" in err_str:
                            logger.warning(
                                f"Column already exists in {version}, skipping: {stmt}"
                            )
                            # On PostgreSQL, we MUST rollback to clear the aborted transaction state
                            # but we can continue to the next statement in a NEW transaction.
                            if is_pg:
                                await db.rollback()
                            continue

                        # If the transaction is aborted, we need to rollback and retry
                        if is_pg and (
                            "infailedsqltransactionerror" in err_str
                            or "transaction is aborted" in err_str
                        ):
                            try:
                                await db.rollback()
                                await db.execute(text(stmt))
                            except Exception as retry_e:
                                raise retry_e from None
                        else:
                            raise
            elif mtype == "func":
                migration_func = globals().get(content)
                if migration_func:
                    await migration_func(db)
                else:
                    logger.error(f"Migration function '{content}' not found, skipping.")

            await set_current_version(db, version)
            await db.commit()
            logger.info(f"Successfully migrated to {version}")
