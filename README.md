# TokenMeter

LLM API 速度测试工具 — 测量首 Token 时间 (TTFT) 和每秒 Token 数 (TPS)。

支持 OpenAI Compatible 和 Anthropic 两种 API 格式，可配置多个测速计划并定时自动执行。

## 关于

本项目先后由 **Xiaomi AI**、**MiniMax** 和 **Google Gemini** 联合支持。~~(用不起 Opus，求给我口 Opus 吧 😭)~~

~~本项目完全由 小米 mimo-v2.5-pro 构建~~ -> ~~后来 MiniMax-M2.7 续了命~~ -> **现在我是三姓家奴，终归还是宇宙大厂 Google Gemini 的免费额度最香 🎯**

👉 在线看速度：<a href="https://code.yangyangx.top/status" target="_blank">https://code.yangyangx.top/status</a>（作者的 coding plan 测速展示 ╮(╯▽╰)╭）

~~😭 来点 token 吧，再来点，我啥都愿意干 (≧◡≦)~~

### 小米 MiMo V2.5 体验

使用<a href="https://platform.xiaomimimo.com/console/balance?ref=283GAL" target="_blank">我的邀请码</a>注册为新用户，即得 ¥10 API 体验金（40天有效）。

邀请码：**283GAL**

### MiniMax Token Plan

<a href="https://platform.minimaxi.com/subscribe/token-plan?code=BLzVdBvhGE&source=link" target="_blank">立即参与 MiniMax 优惠活动 →</a>

## 功能

- **多 Token Plan 管理** — 自由组合 API 地址、模型、Prompt
- **高精度指标采集** — TTFT (ms)、TPS (Overall/Generate)、Token 密度、缓存读取量
- **定时测速引擎** — 基于 APScheduler 的自动化频率检测 (1 分钟 ~ 数小时)
- **数据可视化** — 实时 Dashboard 总览 + 历史性能趋势图
- **数据库迁移** — 使用 Alembic 管理数据库 schema，支持 PostgreSQL
- **安全性** — 自动化 Session 管理，首次启动随机管理员凭据
- **Docker 生产级部署** — 预构建多架构镜像，一键拉起

## 技术栈

| 层 | 技术 |
|---|---|
| **后端** | Python 3.12, FastAPI, SQLAlchemy (Async), APScheduler |
| **数据库** | PostgreSQL (基于 asyncpg & psycopg3, 使用 Alembic 迁移) |
| **前端** | React 19, TypeScript, TailwindCSS v4, Recharts, shadcn/ui |
| **包管理** | <a href="https://docs.astral.sh/uv/" target="_blank">uv</a> (Python), npm (Node) |
| **部署** | Docker, docker-compose, Multi-platform (AMD64/ARM64) |
| **CI/CD** | GitHub Actions (Matrix Testing, GHA Cache) |

## 本机运行

### 前置依赖

- Python 3.12+
- Node.js 20+
- <a href="https://docs.astral.sh/uv/getting-started/installation/" target="_blank">uv</a>

### 安装与运行

```bash
# 安装依赖
make install

# 开发模式 (前端 http://localhost:5173 | 后端 http://localhost:8000)
make dev
```

首次启动请查看终端日志以获取随机生成的 **Admin Password**。

## Docker 部署

### 快速开始 (仅下载配置文件)

```bash
mkdir tokenmeter && cd tokenmeter
curl -O https://raw.githubusercontent.com/qingmuhy744/TokenMeter/main/docker-compose.yml
docker compose up -d
```

### 环境变量配置

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/postgres` | PostgreSQL 连接串 |
| `SECRET_KEY` | 随机生成 | Session 加密密钥 |
| `HTTP_PROXY` | _(空)_ | 全局 HTTP 代理地址 |

### 数据库迁移

使用 [Alembic](https://alembic.sqlalchemy.org/) 管理数据库 schema。

```bash
# 运行迁移
uv run alembic upgrade head

# 创建新迁移
uv run alembic revision --autogenerate -m "description"

# 查看迁移历史
uv run alembic history --verbose
```

### 重置管理员密码

忘记密码？使用内置的 `tm` 工具一行命令搞定：

```bash
# Docker 部署模式：
docker exec tokenmeter tm reset-password

# 本地开发模式：
./bin/tm reset-password
```

执行后终端会打印新的 **Setup Key**，用该 Key 登录后请立即修改密码。

## 测速原理

系统针对每个测速计划执行 `test_count` 次独立请求（取中位数），基于 `time.monotonic()` 进行微秒级计时：

1.  **TTFT (Time to First Token)** — 从请求发出到接收到第一个有效 SSE 数据块的时间。
2.  **TPS (Overall)** — `总 Token 数 / 总响应时间`。
3.  **TPS (Generate)** — `总 Token 数 / (总响应时间 - TTFT)`，反映模型纯生成阶段的速率。
4.  **Token 密度** — `响应字符数 / 生成 Token 数`，评估模型分词效率。
5.  **缓存读取 (Cache Read)** — 针对支持缓存命中的模型（如 Anthropic），统计从缓存中加载的 Token 数量。

## GitHub Actions CI

项目配置了严谨的自动化流水线，确保代码质量与环境一致性：

- **矩阵测试 (Matrix Testing)** — 每次 PR 或 Push 都会在 **SQLite** 和 **PostgreSQL 16** (Service Container) 两个环境下并行运行所有测试用例。
- **多架构构建 (Multi-platform)** — 自动构建支持 `linux/amd64` 和 `linux/arm64` (Apple Silicon/ARM Server) 的 Docker 镜像。
- **构建优化** — 利用 `gha` 类型缓存层，大幅缩减重复构建时间。
- **镜像分级**：
    - `main` 分支 -> 推送至 GHCR 标签 `:latest`。
    - `dev/develop` 分支 -> 推送至 GHCR 标签 `:dev`。
