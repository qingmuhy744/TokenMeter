# CLAUDE.md

## 项目

TokenMeter — LLM API 速度测试工具，测量 TTFT 和 TPS。

## 技术栈

- 后端: Python 3.12, FastAPI, SQLAlchemy (async), aiosqlite/asyncpg, APScheduler
- 前端: React 19, TypeScript, TailwindCSS v4, shadcn/ui (base-nova), Recharts
- 包管理: uv (Python), npm (Node)
- 部署: Docker, docker-compose

## 常用命令

```bash
make install    # 安装依赖
make dev        # 开发模式 (前端 + 后端)
make build      # 构建前端
make test       # 运行测试
make lint       # 代码检查
make docker     # 构建 Docker 镜像
```

Python 测试用 uv 运行：
```bash
uv run pytest                    # 全量测试
uv run pytest backend/tests/test_migration_integration.py -v  # 单文件
```

## 数据库

- SQLite 文件: `token_speed.db`（.gitignore 已排除）
- 支持 PostgreSQL（设置 `DATABASE_URL` 环境变量）
- 测试前备份，测试后恢复：
  ```bash
  cp token_speed.db token_speed.db.bak
  rm -f token_speed.db && uv run pytest
  cp token_speed.db.bak token_speed.db
  ```

### 数据库迁移

没有使用 Alembic，模型定义即 schema。`backend/migrations/manager.py` 管理：
- SQLite → PG 自动迁移（PG 为空 + SQLite 文件存在时触发）
- Schema 版本化迁移（`MIGRATIONS` 列表）
- 新安装由 `Base.metadata.create_all` 自动建表，版本直接标记为最新

**重要**：`run_migrations()` 在异步引擎检查 PG 是否为空后，必须 `await db.rollback()` 释放锁，再启动同步迁移引擎执行 TRUNCATE，否则会死锁。

## 分支策略

- `main` — 禁止直接 push，所有变更通过 PR 合并
- 功能开发 `feat/*`，bugfix `fix/*`
- **新建分支必须基于 `origin/main`**：
  ```bash
  git fetch && git checkout -b feat/xxx origin/main
  ```
- 每次只推送一个 PR，review 通过后合并再处理下一个

## 路径注意

- 前端 `frontend/` 和后端 `backend/` 是独立子目录
- 涉及文件路径的操作优先用绝对路径，不确定时先 `pwd` 确认