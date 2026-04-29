# CLAUDE.md

## 项目

TokenMeter — LLM API 速度测试工具，测量 TTFT 和 TPS。

## 技术栈

- 后端: Python 3.12, FastAPI, SQLAlchemy (async), aiosqlite, APScheduler
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

## 数据库

SQLite 文件: `token_speed.db`（.gitignore 已排除）

测试前备份，测试后恢复：
```bash
cp token_speed.db token_speed.db.bak   # 备份
rm -f token_speed.db && uv run pytest  # 测试（会创建新库）
cp token_speed.db.bak token_speed.db   # 恢复
```

当前已配置的 Token Plans：
- 小米 (mimo-v2.5-pro) — anthropic 格式
- minimax (MiniMax-M2.7) — anthropic 格式

### 数据库迁移

本项目没有使用 Alembic，模型定义即 schema。当 `models.py` 字段变更时：

1. **新安装 / 测试环境** — 直接用新 schema，首次启动自动建表
2. **已有数据库** — 需手动执行迁移 SQL，写在 `backend/migrations/` 目录下

迁移脚本命名规范：`YYYYMMDD_description.sql`，内容示例：
```sql
-- 20260429: test_result 表增加 plan_name 字段（仅用于参考，实际由 ORM 自动建表）
ALTER TABLE test_result ADD COLUMN plan_name TEXT;
```

Docker 用户迁移方式：
```bash
docker exec tokenmeter sqlite3 /data/token_speed.db < backend/migrations/20260429_xxx.sql
```

注意：SQLite 的 ALTER TABLE 功能有限，不支持 DROP COLUMN、修改列类型等操作。如需复杂变更，需重建表。

## 分支策略

- `main` — 只能 merge，不能直接 push
- 功能开发在 `feat/*` 分支

## 测速逻辑

- Token 数: 优先用 `usage.output_tokens`（API 返回值），流式 delta 数量作为兜底
- TTFT: 第一个 content_block_delta 到达时间，无 delta 则用首条 data: 行时间
- TPS (overall): tokens / 总耗时
- TPS (generate): tokens / (总耗时 - TTFT)

## 已知行为

- 小米 API 返回 content_block_delta 事件但 parser 未匹配到文本（deltas > 0 但无内容），token 数来自 usage 字段
- Minimax 使用 Anthropic SSE 格式，已支持 event: 行追踪
- shadcn CSS 变量使用 oklch 格式，Recharts SVG 用 `var(--color-*)` 而非 `hsl(var(--*))`
