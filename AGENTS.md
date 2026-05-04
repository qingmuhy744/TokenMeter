# TokenMeter — LLM API 速度测试工具

## 技术栈

- 后端: Python 3.12, FastAPI, SQLAlchemy (async), asyncpg, Alembic, APScheduler
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
- `uv run pytest` 全量测试（需要设置 DATABASE_URL 环境变量）

## 数据库

- PostgreSQL（通过 `DATABASE_URL` 环境变量配置）
- Alembic 管理数据库迁移

### PostgreSQL 调试

- 远程 PG 连接地址和 SSH 连入方法见 `.env` 文件
- Docker 部署的 PG 数据存放在 `./pg-data`

### Alembic 迁移

```bash
# 运行迁移
uv run alembic upgrade head

# 创建新迁移
uv run alembic revision --autogenerate -m "description"

# 查看迁移历史
uv run alembic history --verbose
```

迁移文件位置：`backend/alembic/versions/`