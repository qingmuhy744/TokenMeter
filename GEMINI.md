# GEMINI.md

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

没有使用 Alembic，模型定义即 schema。`backend/migrations/manager.py` 管理：
- SQLite → PG 自动迁移（PG 为空 + SQLite 文件存在时触发）
- Schema 版本化迁移（`MIGRATIONS` 列表，支持 `sql` 和 `func` 两种类型）
- 新安装由 `Base.metadata.create_all` 自动建表，版本直接标记为最新

**重要**：`run_migrations()` 在异步引擎检查 PG 是否为空后，必须 `await db.rollback()` 释放锁，再启动同步迁移引擎执行 TRUNCATE，否则会死锁。

## 分支策略

- `main` — 禁止直接 push，所有变更必须通过 PR 合并（包括 bugfix、文档、配置等）
- 功能开发在 `feat/*` 分支，bugfix 在 `fix/*` 分支
- **创建分支如果没指定，必须从 `origin/main`**，禁止从其他分支创建，避免带入无关改动
  ```bash
  # 正确：基于 origin/main 新建分支
  git fetch
  git checkout -b fix/xxx origin/main

  # 错误：从当前分支/local feature 分支创建，会带入无关改动
  git checkout -b fix/xxx
  ```
- 创建分支 → 提交 → 推送 → 创建 PR → 合并，不得跳过
- **每次只推送一个 PR**，由用户在 GitHub review，通过后合并再处理下一个

## 测速逻辑

- Token 数: 优先用 `usage.output_tokens`（API 返回值），流式 delta 数量作为兜底
- TTFT: 第一个 content_block_delta 到达时间，无 delta 则用首条 data: 行时间
- TPS (overall): tokens / 总耗时
- TPS (generate): tokens / (总耗时 - TTFT)

## Git 提交注意

- Pre-commit hook 会自动运行 ruff format 和 ruff check，可能格式化代码
- 如果 commit 失败提示 "files were modified by this hook"，说明 ruff 格式化了文件，**重新 `git add` 再 commit 即可**，不需要手动修改

## 路径注意

- **每条命令执行前先确认当前目录** (`pwd`)。前端 (`frontend/`) 和后端 (`backend/`) 是独立子目录，Shell 的 cwd 可能停留在任一位置
- 涉及文件路径的操作（`git add <path>`、`uv run pytest`、`npm run build` 等），优先使用**绝对路径**或显式 `cd` 到仓库根目录后再执行，避免 pathspec 不匹配
- 若不确定当前目录，**立即用 `pwd` 确认**，不要凭记忆假设

## 已知行为

- 小米 API 返回 content_block_delta 事件但 parser 未匹配到文本（deltas > 0 但无内容），token 数来自 usage 字段
- Minimax 使用 Anthropic SSE 格式，已支持 event: 行追踪
- shadcn CSS 变量使用 oklch 格式，Recharts SVG 用 `var(--color-*)` 而非 `hsl(var(--*))`
