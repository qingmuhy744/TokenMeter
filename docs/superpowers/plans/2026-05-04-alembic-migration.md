# Alembic 迁移系统改造实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 使用 Alembic 替代自定义迁移系统，移除 SQLite/PostgreSQL 自动迁移逻辑，固定使用 PostgreSQL

**架构：** 将迁移系统从自定义 manager.py 迁移到标准 Alembic，保留 PostgreSQL 支持但删除自动迁移逻辑

**技术栈：** Alembic, SQLAlchemy 2.0, PostgreSQL

---

## 文件变更清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `pyproject.toml` | 修改 | 添加 alembic 依赖 |
| `backend/alembic/env.py` | 创建 | Alembic 环境配置，连接 PostgreSQL |
| `backend/alembic/script.py.mako` | 创建 | 迁移脚本模板 |
| `backend/alembic/versions/` | 创建 | 迁移文件目录 |
| `backend/alembic.ini` | 创建 | Alembic 配置文件 |
| `backend/config.py` | 修改 | 移除 SQLite 相关配置 |
| `backend/database.py` | 修��� | 移除 init_db 和自定义迁移 |
| `backend/main.py` | 修改 | 使用 alembic upgrade head |
| `backend/migrations/` | 删除 | 完全移除自定义迁移目录 |
| `Makefile` | 修改 | 更新 make 命令 |

---

## 任务 1：添加 Alembic 依赖

**文件：**
- 修改：`pyproject.toml:6-18`

- [ ] **步骤 1：添加 alembic 依赖**

```toml
[project]
name = "token-speed-test"
version = "0.1.0"
description = "LLM API speed testing tool - measure TTFT and TPS across providers"
requires-python = ">=3.12"
dependencies = [
    "aiosqlite>=0.22.1",
    "alembic>=1.14.0",
    "apscheduler>=3.11.2",
    "asyncpg>=0.31.0",
    "bcrypt>=5.0.0",
    "fastapi>=0.136.1",
    "greenlet>=3.5.0",
    "httpx>=0.28.1",
    "itsdangerous>=2.2.0",
    "psycopg2-binary>=2.9.12",
    "psycopg[binary]>=3.3.3",
    "sqlalchemy>=2.0.49",
    "uvicorn[standard]>=0.46.0",
]
```

- [ ] **步骤 2：Commit**

```bash
git add pyproject.toml
git commit -m "chore: add alembic dependency"
```

---

## 任务 2：初始化 Alembic

**文件：**
- 创建：`backend/alembic/env.py`
- 创建：`backend/alembic/script.py.mako`
- 创建：`backend/alembic/versions/`
- 创建：`backend/alembic.ini`

- [ ] **步骤 1：初始化 Alembic**

运行：`uv run alembic init backend/alembic`

预期输出：生成 `backend/alembic/env.py`, `backend/alembic/script.py.mako`, `backend/alembic/versions/`, `backend/alembic.ini`

- [ ] **步骤 2：配置 alembic.ini**

修改 `alembic.ini` 中的 sqlalchemy.url 为占位符：
```ini
sqlalchemy.url = postgresql://user:pass@localhost/dbname
```

- [ ] **步骤 3：Commit**

```bash
git add backend/alembic/ backend/alembic.ini
git commit -m "chore: initialize Alembic"
```

---

## 任务 3：配置 Alembic 连接 PostgreSQL

**文件：**
- 修改：`backend/alembic/env.py`

- [ ] **步骤 1：修改 env.py 加载数据库配置**

读取 `backend/config.py` 获取 DATABASE_URL，并设置到 alembic config：

```python
# 在 run_migrations_offline() 和 run_migrations_online() 之前添加
def get_url():
    from backend.config import settings
    return settings.database_url

# 修改 run_migrations_offline()
def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    # ... 其余代码保持不变

# 修改 run_migrations_online()
def run_migrations_online() -> None:
    from backend.config import settings
    from sqlalchemy import create_engine
    
    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = settings.database_url
    connectable = create_engine(
        configuration["sqlalchemy.url"],
        poolclass=pool.NullPool,
    )
    # ... 其余代码保持不变
```

- [ ] **步骤 2：Commit**

```bash
git add backend/alembic/env.py
git commit -m "config: connect Alembic to PostgreSQL via config"
```

---

## 任务 4：生成初始迁移

**文件：**
- 创建：`backend/alembic/versions/<timestamp>_initial.py`
- 修改：`backend/alembic/env.py:1-10` 添加 import

- [ ] **步骤 1：生成初始迁移**

运行：`uv run alembic revision --autogenerate -m "initial schema"`

预期：生成迁移文件，包含所有表的创建（users, token_plans, test_results, settings）

- [ ] **步骤 2：检查迁移文件内容**

读取生成的迁移文件，确认包含：
- `create_table('users')`
- `create_table('token_plans')`
- `create_table('test_results')`
- `create_table('settings')`

- [ ] **���骤 3：运行迁移验证**

运行：`uv run alembic upgrade head`

预期：成功执行，数据库表创建完成

- [ ] **步骤 4：Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat: add initial Alembic migration"
```

---

## 任务 5：改造 config.py - 移除 SQLite 支持

**文件：**
- 修改：`backend/config.py`

- [ ] **步骤 1：简化 config.py**

保留 DATABASE_URL，完全移除 SQLite 相关代码：

```python
import os
import secrets


class Settings:
    VERSION: str = "0.1.0"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")
    ADMIN_USER: str = os.getenv("ADMIN_USER", "admin")
    SECRET_KEY: str = os.getenv("SECRET_KEY") or secrets.token_hex(32)
    DEFAULT_PROMPT: str = (
        "Please write a 500-word article about artificial intelligence."
    )
    DEFAULT_MAX_TOKENS: int = 256
    DEFAULT_TEST_COUNT: int = 3
    TIMEOUT_SECONDS: int = 30

    @property
    def database_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


settings = Settings()
```

- [ ] **步骤 2：Commit**

```bash
git add backend/config.py
git commit -m "refactor: remove SQLite support, use PostgreSQL only"
```

---

## 任务 6：改造 database.py - 移除自定义迁移

**文件：**
- 修改：`backend/database.py`

- [ ] **步骤 1：简化 database.py**

移除 init_db() 函数和 migrations import：

```python
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
import logging
import time

from backend.config import settings

logger = logging.getLogger(__name__)

engine = create_async_engine(
    settings.database_url, echo=False, pool_size=10, max_overflow=20, pool_timeout=60
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@event.listens_for(Engine, "checkout")
def receive_checkout(dbapi_connection, connection_record, connection_proxy):
    connection_record.info["checkout_time"] = time.time()


@event.listens_for(Engine, "checkin")
def receive_checkin(dbapi_connection, connection_record):
    if "checkout_time" in connection_record.info:
        duration = time.time() - connection_record.info["checkout_time"]
        if duration > 1.0:  # Log connections held for more than 1 second
            logger.warning(f"Connection held for {duration:.2f}s")


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session
```

- [ ] **步骤 2：Commit**

```bash
git add backend/database.py
git commit -m "refactor: remove custom migration from database.py"
```

---

## 任务 7：改造 main.py - 使用 Alembic 初始化

**文件：**
- 修改：`backend/main.py`

- [ ] **步骤 1：查看当前 main.py**

运行：`cat backend/main.py`

- [ ] **步骤 2：修改 main.py**

移除 `init_db` 导入和调用，添加 alembic 初始化：

```python
# 移除这行：
# from backend.database import init_db

# 在 lifespan startup 中添加：
async def lifespan(app: FastAPI):
    # Run Alembic migrations on startup
    import subprocess
    subprocess.run(["alembic", "upgrade", "head"], check=True)
    
    # ... 其他 startup 代码
```

更优雅的方式是通过 API 调用：

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
import alembic.command
import alembic.config


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run Alembic migrations on startup
    alembic_cfg = alembic.config.Config("alembic.ini")
    alembic.command.upgrade(alembic_cfg, "head")
    
    yield
    # shutdown
```

- [ ] **步骤 3：Commit**

```bash
git add backend/main.py
git commit -m "refactor: use Alembic for database initialization"
```

---

## 任务 8：删除自定义迁移目录

**文件：**
- 删除：`backend/migrations/`

- [ ] **步骤 1：删除 migrations 目录**

运行：`rm -rf backend/migrations/`

- [ ] **步骤 2：更新 coverage 配置**

修改 `pyproject.toml` 移除 migrations 目录：

```toml
[tool.coverage.run]
source = ["backend"]
concurrency = ["greenlet", "thread"]
omit = [
    "backend/cli.py",
    "backend/seed_data.py",
    "backend/tests/*",
]
```

- [ ] **步骤 3：Commit**

```bash
git add pyproject.toml
git rm -rf backend/migrations/
git commit -m "refactor: remove custom migrations directory"
```

---

## 任务 9：更新 Makefile（如有）

**文件：**
- 修改：`Makefile`

- [ ] **步骤 1：检查 Makefile**

运行：`cat Makefile | grep -E "(install|dev|migrate)"`

- [ ] **步骤 2：更新相关命令**

如果 Makefile 包含数据库相关命令，更新为使用 alembic：

```makefile
# 替换自定义迁移命令为 alembic
migrate:
	alembic upgrade head

migration-create:
	alembic revision --autogenerate -m "$(NAME)"
```

- [ ] **步骤 3：Commit**

```bash
git add Makefile
git commit -m "chore: update Makefile to use Alembic"
```

---

## 任务 10：验证整体功能

**文件：**
- 测试：`backend/tests/`

- [ ] **步骤 1：运行现有测试**

运行：`uv run pytest backend/tests/ -v`

预期：所有测试通过（如果之前有测试依赖 migrations 模块，需要调整）

- [ ] **步骤 2：测试数据库连接**

运行：`uv run python -c "from backend.database import engine; from sqlalchemy import text; import asyncio; asyncio.run(engine.dispose())"`

预期：无错误

- [ ] **步骤 3：Commit**

```bash
git commit -m "test: verify all tests pass with Alembic"
```

---

## 执行方式

**计划已完成并保存到 `docs/superpowers/plans/2026-05-04-alembic-migration.md`。**

两种执行方式：

1. **子代理驱动（推荐）** - 每个任务调度一个新的子代理，任务间进行审查，快速迭代
2. **内联执行** - 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

选哪种方式？