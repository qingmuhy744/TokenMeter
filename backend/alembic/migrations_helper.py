"""Migration helper functions for legacy data migration."""

import logging
import os
from sqlalchemy import create_engine, text

logger = logging.getLogger(__name__)


def get_legacy_db_url() -> str | None:
    """Get legacy SQLite database URL if file exists."""
    db_path = "token_speed.db"
    if os.path.exists(db_path):
        return f"sqlite:///{db_path}"
    return None


def detect_needs_migration(engine) -> bool:
    """Check if database needs legacy data migration.

    Returns True if:
    - alembic_version table exists (new system)
    - but token_plans table is empty
    - and legacy SQLite file exists
    """
    with engine.connect() as conn:
        # Check if alembic_version exists
        result = conn.execute(
            text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'alembic_version'
            )
        """)
        )
        has_alembic = result.scalar()

        if not has_alembic:
            return False

        # Check if there's data to migrate
        result = conn.execute(text("SELECT COUNT(*) FROM token_plans"))
        has_data = result.scalar() > 0

        # Check if legacy SQLite exists
        has_legacy = os.path.exists("token_speed.db")

        return has_alembic and not has_data and has_legacy


def export_legacy_data(legacy_url: str) -> dict:
    """Export all data from legacy SQLite database."""
    data = {}
    legacy_engine = create_engine(legacy_url)
    tables = ["users", "settings", "token_plans", "test_results"]

    with legacy_engine.connect() as conn:
        for table in tables:
            try:
                result = conn.execute(text(f"SELECT * FROM {table}"))
                rows = [dict(row._mapping) for row in result]
                data[table] = rows
                logger.info(f"Exported {len(rows)} rows from {table}")
            except Exception as e:
                logger.warning(f"Failed to export {table}: {e}")
                data[table] = []

    legacy_engine.dispose()
    return data


def import_data_to_new_db(target_engine, data: dict):
    """Import data to new Alembic-managed database."""
    with target_engine.connect() as conn:
        # Import users
        for row in data.get("users", []):
            conn.execute(
                text(
                    "INSERT INTO users (id, username, password_hash) VALUES (:id, :username, :password_hash)"
                ),
                row,
            )

        # Import settings
        for row in data.get("settings", []):
            conn.execute(
                text("INSERT INTO settings (key, value) VALUES (:key, :value)"), row
            )

        # Import token_plans
        for row in data.get("token_plans", []):
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

        conn.commit()
        logger.info("Data import completed")
