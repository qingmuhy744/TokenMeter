# CLAUDE.md

## 项目

TokenMeter — LLM API 速度测试工具，测量 TTFT 和 TPS。

## 技术栈

- 后端: Python 3.12, FastAPI, SQLAlchemy (async), asyncpg, Alembic, APScheduler
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
uv run pytest                    # 全量测试（需要设置 DATABASE_URL 环境变量）
```

## 数据库

- PostgreSQL（通过 `DATABASE_URL` 环境变量配置）
- Alembic 管理数据库迁移

### 数据库操作与调试

- **PostgreSQL**: 关于如何通过 SSH 连入并使用 Docker 操作调试数据库（192.168.8.3），请参考本地 `.env` 文件中的注释说明。

当前已配置的 Token Plans：
- 小米 (mimo-v2.5-pro) — anthropic 格式
- minimax (MiniMax-M2.7) — anthropic 格式

### 从旧版迁移

旧版本使用 `backend/migrations/manager.py` 手动管理迁移，已迁移到 Alembic。

**迁移步骤：**

1. 确保 PostgreSQL 可用并设置 `DATABASE_URL`：
   ```bash
   export DATABASE_URL="postgresql://user:pass@host/dbname"
   ```

2. 运行 Alembic 升级：
   ```bash
   uv run alembic upgrade head
   ```

3. 如有旧版数据需要迁移，手动导入：
   ```bash
   # 从旧 SQLite 导出数据
   sqlite3 token_speed.db ".dump" > migration.sql

   # 导入 PostgreSQL（需手动调整语法）
   psql $DATABASE_URL -f migration.sql
   ```

**Alembic 命令：**
```bash
uv run alembic upgrade head       # 升级到最新
uv run alembic downgrade -1       # 降一级
uv run alembic history --verbose  # 查看历史
uv run alembic revision --autogenerate -m "description"  # 创建新迁移
```

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

## 路径注意

- **每条命令执行前先确认当前目录** (`pwd`)。前端 (`frontend/`) 和后端 (`backend/`) 是独立子目录，Shell 的 cwd 可能停留在任一位置
- 涉及文件路径的操作（`git add <path>`、`uv run pytest`、`npm run build` 等），优先使用**绝对路径**或显式 `cd` 到仓库根目录后再执行，避免 pathspec 不匹配
- 若不确定当前目录，**立即用 `pwd` 确认**，不要凭记忆假设

## 测速逻辑

- Token 数: 优先用 `usage.output_tokens`（API 返回值），流式 delta 数量作为兜底
- TTFT: 第一个 content_block_delta 到达时间，无 delta 则用首条 data: 行时间
- TPS (overall): tokens / 总耗时
- TPS (generate): tokens / (总耗时 - TTFT)

## 已知行为

- 小米 API 返回 content_block_delta 事件但 parser 未匹配到文本（deltas > 0 但无内容），token 数来自 usage 字段
- Minimax 使用 Anthropic SSE 格式，已支持 event: 行追踪
- shadcn CSS 变量使用 oklch 格式，Recharts SVG 用 `var(--color-*)` 而非 `hsl(var(--*))`

## Git 提交注意

- Pre-commit hook 会自动运行 ruff format 和 ruff check，可能格式化代码
- 如果 commit 失败提示 "files were modified by this hook"，说明 ruff 格式化了文件，**重新 `git add` 再 commit 即可**，不需要手动修改

# Superpowers-ZH 中文增强版

本项目已安装 superpowers-zh 技能框架（20 个 skills）。

## 核心规则

1. **收到任务时，先检查是否有匹配的 skill** — 哪怕只有 1% 的可能性也要检查
2. **设计先于编码** — 收到功能需求时，先用 brainstorming skill 做需求分析
3. **测试先于实现** — 写代码前先写测试（TDD）
4. **验证先于完成** — 声称完成前必须运行验证命令

## 可用 Skills

Skills 位于 `.claude/skills/` 目录，每个 skill 有独立的 `SKILL.md` 文件。

- **brainstorming**: 在任何创造性工作之前必须使用此技能——创建功能、构建组件、添加功能或修改行为。在实现之前先探索用户意图、需求和设计。
- **chinese-code-review**: 中文代码审查规范——在保持专业严谨的同时，用符合国内团队文化的方式给出有效反馈
- **chinese-commit-conventions**: 中文 Git 提交规范 — 适配国内团队的 commit message 规范和 changelog 自动化
- **chinese-documentation**: 中文技术文档写作规范——排版、术语、结构一步到位，告别机翻味
- **chinese-git-workflow**: 适配国内 Git 平台和团队习惯的工作流规范——Gitee、Coding、极狐 GitLab、CNB 全覆盖
- **dispatching-parallel-agents**: 当面对 2 个以上可以独立进行、无共享状态或顺序依赖的任务时使用
- **executing-plans**: 当你有一份书面实现计划需要在单独的会话中执行，并设有审查检查点时使用
- **finishing-a-development-branch**: 当实现完成、所有测试通过、需要决定如何集成工作时使用——通过提供合并、PR 或清理等结构化选项来引导开发工作的收尾
- **mcp-builder**: MCP 服务器构建方法论 — 系统化构建生产级 MCP 工具，让 AI 助手连接外部能力
- **receiving-code-review**: 收到代码审查反馈后、实施建议之前使用，尤其当反馈不明确或技术上有疑问时——需要技术严谨性和验证，而非敷衍附和或盲目执行
- **requesting-code-review**: 完成任务、实现重要功能或合并前使用，用于验证工作成果是否符合要求
- **subagent-driven-development**: 当在当前会话中执行包含独立任务的实现计划时使用
- **systematic-debugging**: 遇到任何 bug、测试失败或异常行为时使用，在提出修复方案之前执行
- **test-driven-development**: 在实现任何功能或修复 bug 时使用，在编写实现代码之前
- **using-git-worktrees**: 当需要开始与当前工作区隔离的功能开发或执行实现计划之前使用——创建具有智能目录选择和安全验证的隔离 git 工作树
- **using-superpowers**: 在开始任何对话时使用——确立如何查找和使用技能，要求在任何响应（包括澄清性问题）之前调用 Skill 工具
- **verification-before-completion**: 在宣称工作完成、已修复或测试通过之前使用，在提交或创建 PR 之前——必须运行验证命令并确认输出后才能声称成功；始终用证据支撑断言
- **workflow-runner**: 在 Claude Code / OpenClaw / Cursor 中直接运行 agency-orchestrator YAML 工作流——无需 API key，使用当前会话的 LLM 作为执行引擎。当用户提供 .yaml 工作流文件或要求多角色协作完成任务时触发。
- **writing-plans**: 当你有规格说明或需求用于多步骤任务时使用，在动手写代码之前
- **writing-skills**: 当创建新技能、编辑现有技能或在部署前验证技能是否有效时使用

## 如何使用

当任务匹配某个 skill 时，使用 `Skill` 工具加载对应 skill 并严格遵循其流程。绝不要用 Read 工具读取 SKILL.md 文件。

如果你认为哪怕只有 1% 的可能性某个 skill 适用于你正在做的事情，你必须调用该 skill 检查。
