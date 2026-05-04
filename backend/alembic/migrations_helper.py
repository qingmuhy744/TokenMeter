"""Migration helper functions for legacy data migration."""

import logging
import os
from sqlalchemy import create_engine, text, select, table as sa_table, column

logger = logging.getLogger(__name__)


def run_alembic_migration(alembic_cfg) -> None:
    """Run Alembic migration, handling legacy databases."""
    from alembic import command

    try:
        command.upgrade(alembic_cfg, "head")
        return
    except Exception as e:
        err = str(e)
        # If tables already exist from old migration system, stamp instead
        if "already exists" in err.lower() or "duplicatetable" in err.lower():
            logger.info("Detected existing database from old system, stamping as head")
            command.stamp(alembic_cfg, "head")
            return
        raise


def get_legacy_db_url() -> str | None:
    """Get legacy SQLite database URL if file exists."""
    db_path = "token_speed.db"
    if os.path.exists(db_path):
        return f"sqlite:///{db_path}"
    return None


def export_legacy_data(legacy_url: str) -> dict:
    """Export all data from legacy SQLite database."""
    data = {}
    legacy_engine = create_engine(legacy_url)
    tables = ["users", "settings", "token_plans", "test_results"]

    with legacy_engine.connect() as conn:
        for table_name in tables:
            try:
                tbl = sa_table(table_name, column("*"))
                result = conn.execute(select(tbl))
                rows = [dict(row._mapping) for row in result]
                data[table_name] = rows
                logger.info(f"Exported {len(rows)} rows from {table_name}")
            except Exception as e:
                logger.warning(f"Failed to export {table_name}: {e}")
                data[table_name] = []

    legacy_engine.dispose()
    return data


def import_data_to_new_db(target_engine, data: dict):
    """Import data to new Alembic-managed database."""
    with target_engine.connect() as conn:
        trans = conn.begin()
        try:
            # Import users
            for row in data.get("users", []):
                conn.execute(
                    text(
                        "INSERT INTO users (id, username, password_hash) VALUES (:id, :username, :password_hash) ON CONFLICT (id) DO NOTHING"
                    ),
                    row,
                )

            # Import settings
            for row in data.get("settings", []):
                conn.execute(
                    text(
                        "INSERT INTO settings (key, value) VALUES (:key, :value) ON CONFLICT (key) DO NOTHING"
                    ),
                    row,
                )

            # Import token_plans
            for row in data.get("token_plans", []):
                row = dict(row)
                # SQLite stores booleans as 0/1, convert explicitly
                row["is_active"] = int(row.get("is_active", 1)) == 1
                conn.execute(
                    text("""INSERT INTO token_plans 
                        (id, name, api_type, api_base, api_key, model, prompt, max_tokens, test_count, interval_minutes, is_active, parent_id, multiplier, created_at, updated_at)
                        VALUES (:id, :name, :api_type, :api_base, :api_key, :model, :prompt, :max_tokens, :test_count, :interval_minutes, :is_active, :parent_id, :multiplier, :created_at, :updated_at)
                        ON CONFLICT (id) DO NOTHING"""),
                    row,
                )

            # Import test_results
            for row in data.get("test_results", []):
                conn.execute(
                    text("""INSERT INTO test_results 
                        (id, plan_id, ttft_ms, tps_overall, tps_generate, total_tokens, total_time_ms, input_tokens, cache_read, char_count, token_density, ttfb_ms, ttfr_ms, think_time_ms, content_tokens, thinking_tokens, tps_content, content_char_count, thinking_char_count, ping_ms, ping_samples, error, note, debug_chunks, created_at)
                        VALUES (:id, :plan_id, :ttft_ms, :tps_overall, :tps_generate, :total_tokens, :total_time_ms, :input_tokens, :cache_read, :char_count, :token_density, :ttfb_ms, :ttfr_ms, :think_time_ms, :content_tokens, :thinking_tokens, :tps_content, :content_char_count, :thinking_char_count, :ping_ms, :ping_samples, :error, :note, :debug_chunks, :created_at)
                        ON CONFLICT (id) DO NOTHING"""),
                    row,
                )

            trans.commit()
            logger.info("Data import completed")
        except Exception:
            trans.rollback()
            logger.exception("Data import failed, rolled back")
            raise


async def check_and_migrate_legacy():
    """Check for legacy SQLite data and migrate if needed."""
    import shutil
    from backend.database import async_session

    legacy_url = get_legacy_db_url()
    if not legacy_url:
        return

    try:
        async with async_session() as db:
            from sqlalchemy import text

            result = await db.execute(text("SELECT COUNT(*) FROM token_plans"))
            has_data = result.scalar() > 0
            if has_data:
                return

        logger.info("Found legacy SQLite data, starting migration...")
        from backend.config import settings
        from sqlalchemy import create_engine

        target_engine = create_engine(
            settings.DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
        )
        try:
            data = export_legacy_data(legacy_url)

            if any(data.values()):
                import_data_to_new_db(target_engine, data)

                total = sum(len(rows) for rows in data.values())
                logger.info(f"Legacy data migration completed: {total} rows migrated")

                shutil.move("token_speed.db", "token_speed.db.migrated")
                logger.info("Legacy SQLite moved to token_speed.db.migrated")
            else:
                logger.info("No data found in legacy database")
        finally:
            target_engine.dispose()
    except Exception:
        logger.exception("Legacy migration check failed, continuing startup")
