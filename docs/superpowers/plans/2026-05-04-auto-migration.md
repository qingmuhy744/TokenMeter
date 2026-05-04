# 自动化数据迁移脚本实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。

**目标：** 创建自动化数据迁移脚本，支持从旧版（自定义迁移 + SQLite/手动PG）迁移到新版（Alembic + PostgreSQL）

**架构：** 在应用启动时自动检测并执行数据迁移，用户只需更新 Docker 镜像即可自动完成迁移

**技术栈：** Alembic, SQLAlchemy, Python

---

## 文件变更清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `backend/alembic/env.py` | 修改 | 添加迁移前数据导出功能 |
| `backend/alembic/versions/<timestamp>_migrate_from_legacy.py` | 创建 | 一次性数据迁移脚本 |
| `backend/alembic/migrations_helper.py` | 创建 | 迁移辅助函数（旧数据导出/导入） |

---

## 任务 1：分析旧版数据导出方案

**文件：**
- 创建：`backend/alembic/migrations_helper.py`

- [ ] **步骤 1：创建 migrations_helper.py**

实现从旧系统导出数据的函数：

```python
"""Migration helper functions for legacy data migration."""
import json
import logging
from datetime import datetime
from sqlalchemy import create_engine, text, inspect

logger = logging.getLogger(__name__)


def get_legacy_db_url() -> str | None:
    """Get legacy SQLite database URL if file exists."""
    import os
    db_path = "token_speed.db"
    if os.path.exists(db_path):
        return f"sqlite:///{db_path}"
    return None


def detect_legacy_postgres(engine) -> bool:
    """Detect if database was managed by old migration system."""
    with engine.connect() as conn:
        # Check if alembic_version table exists (new system)
        result = conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'alembic_version'
            )
        """))
        has_alembic = result.scalar()
        
        # Check if settings table has db_version (old system)
        result = conn.execute(text("SELECT value FROM settings WHERE key = 'db_version'"))
        old_version = result.scalar()
        
        return not has_alembic and old_version is not None


def export_legacy_data(engine) -> dict:
    """Export all data from legacy database."""
    data = {}
    tables = ['users', 'settings', 'token_plans', 'test_results']
    
    with engine.connect() as conn:
        for table in tables:
            try:
                result = conn.execute(text(f'SELECT * FROM {table}'))
                rows = [dict(row._mapping) for row in result]
                data[table] = rows
                logger.info(f"Exported {len(rows)} rows from {table}")
            except Exception as e:
                logger.warning(f"Failed to export {table}: {e}")
                data[table] = []
    
    return data


def import_data_to_new_db(target_engine, data: dict):
    """Import data to new Alembic-managed database."""
    with target_engine.connect() as conn:
        # Import settings
        for row in data.get('settings', []):
            conn.execute(
                text("INSERT INTO settings (key, value) VALUES (:key, :value)"),
                row
            )
        
        # Import users
        for row in data.get('users', []):
            conn.execute(
                text("INSERT INTO users (id, username, password_hash) VALUES (:id, :username, :password_hash)"),
                row
            )
        
        # Import token_plans (handle potential ID conflicts)
        for row in data.get('token_plans', []):
            conn.execute(
                text("""INSERT INTO token_plans 
                    (id, name, api_type, api_base, api_key, model, prompt, max_tokens, test_count, interval_minutes, is_active, parent_id, multiplier, created_at, updated_at)
                    VALUES (:id, :name, :api_type, :api_base, :api_key, :model, :prompt, :max_tokens, :test_count, :interval_minutes, :is_active, :parent_id, :multiplier, :created_at, :updated_at)
                    ON CONFLICT (id) DO NOTHING"""),
                row
            )
        
        # Import test_results
        for row in data.get('test_results', []):
            conn.execute(
                text("""INSERT INTO test_results 
                    (id, plan_id, ttft_ms, tps_overall, tps_generate, total_tokens, total_time_ms, input_tokens, cache_read, char_count, token_density, ttfb_ms, ttfr_ms, think_time_ms, content_tokens, thinking_tokens, tps_content, content_char_count, thinking_char_count, ping_ms, ping_samples, error, note, debug_chunks, created_at)
                    VALUES (:id, :plan_id, :ttft_ms, :tps_overall, :tps_generate, :total_tokens, :total_time_ms, :input_tokens, :cache_read, :char_count, :token_density, :ttfb_ms, :ttfr_ms, :think_time_ms, :content_tokens, :thinking_tokens, :tps_content, :content_char_count, :thinking_char_count, :ping_ms, :ping_samples, :error, :note, :debug_chunks, :created_at)
                    ON CONFLICT (id) DO NOTHING"""),
                row
            )
        
        conn.commit()
        logger.info("Data import completed")
```

- [ ] **步骤 2：Commit**

```bash
git add backend/alembic/migrations_helper.py
git commit -m "feat: add legacy data migration helper"
```

---

## 任务 2：修改 main.py 添加自动迁移触发

**文件：**
- 修改：`backend/main.py`

- [ ] **步骤 1：修改 main.py 添加自动迁移**

在 lifespan 中添加迁移检测和执行：

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    from backend.alembic.migrations_helper import check_and_migrate
    
    # Run Alembic migrations + legacy data migration
    await check_and_migrate()
    
    yield
    # shutdown
```

- [ ] **步骤 2：在 migrations_helper.py 中添加 check_and_migrate 函数**

```python
async def check_and_migrate():
    """Check for legacy data and migrate if needed."""
    from backend.config import settings
    from sqlalchemy import create_engine
    import os
    
    target_engine = create_engine(settings.database_url)
    
    with target_engine.connect() as conn:
        # Check if already migrated (alembic_version exists)
        result = conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'alembic_version'
            )
        """))
        is_new_db = result.scalar()
        
        # Check if there's legacy data to migrate
        result = conn.execute(text("SELECT COUNT(*) FROM token_plans"))
        has_data = result.scalar() > 0
        
        # If new DB with no data, try to migrate from SQLite
        if is_new_db and not has_data:
            legacy_url = get_legacy_db_url()
            if legacy_url:
                logger.info("Found legacy SQLite data, migrating...")
                legacy_engine = create_engine(legacy_url)
                data = export_legacy_data(legacy_engine)
                
                if any(data.values()):
                    import_data_to_new_db(target_engine, data)
                    logger.info("Legacy data migration completed")
                else:
                    logger.info("No legacy data found")
    
    target_engine.dispose()
```

- [ ] **步骤 3：Commit**

```bash
git add backend/main.py backend/alembic/migrations_helper.py
git commit -m "feat: add automatic legacy data migration on startup"
```

---

## 任务 3：测试自动迁移功能

- [ ] **步骤 1：清空 PostgreSQL 模拟全新安装**
- [ ] **步骤 2：保留旧 SQLite 文件**
- [ ] **步骤 3：启动应用触发迁移**
- [ ] **步骤 4：验证数据迁移成功**

- [ ] **步骤 5：Commit**

```bash
git commit -m "test: verify automatic migration works"
```

---

## 执行方式

计划已完成。选哪种执行方式？

1. **子代理驱动（推荐）**
2. **内联执行**