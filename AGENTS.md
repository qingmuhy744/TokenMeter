# TokenMeter — LLM API 速度测试工具

## 技术栈

- 后端: Python 3.12, FastAPI, SQLAlchemy (async), aiosqlite/asyncpg, APScheduler
- 前端: React 19, TypeScript, TailwindCSS v4, shadcn/ui (base-nova), Recharts
- 包管理: uv (Python), npm (Node)
- 部署: Docker, docker-compose

## 常用命令

- `make install` 安装依赖
- `make dev` 开发模式 (前端 + 后端)
- `make build` 构建前端
- `make test` 运行测试
- `make lint` 代码检查

Python 测试用 uv 运行：
- `uv run pytest` 全量测试
- `uv run pytest backend/tests/test_migration_integration.py -v` 单文件

## 数据库

- SQLite 文件: `token_speed.db`（.gitignore 已排除）
- 支持 PostgreSQL（设置 `DATABASE_URL` 环境变量）
- 测试前备份，测试后恢复：
  ```bash
  cp token_speed.db token_speed.db.bak
  rm -f token_speed.db && uv run pytest
  cp token_speed.db.bak token_speed.db
  ```

### PostgreSQL 调试

- 远程 PG 连接地址和 SSH 连入方法见 `.env` 文件
- Docker 部署的 PG 数据存放在 `./pg-data`

### 数据库迁移

- 没有使用 Alembic，模型定义即 schema
- `backend/migrations/manager.py` 管理：
  - SQLite → PG 自动迁移（PG 为空 + SQLite 文件存在时触发）
  - Schema 版本化迁移（`MIGRATIONS` 列表，支持 `sql` 和 `func` 两种类型）
  - 新安装由 `Base.metadata.create_all` 自动建表，版本直接标记为最新
- **重要**：`run_migrations()` 异步检查 PG 是否为空后，必须 `await db.rollback()` 释放锁，再启动同步迁移引擎执行 TRUNCATE，否则死锁
- **迁移版本顺序关键**：DROP NOT NULL 必须在 `convert_to_suites` 之前，否则子模型 NULL 字段违反约束