# TokenMeter

LLM API 速度测试工具 — 测量首 Token 时间 (TTFT) 和每秒 Token 数 (TPS)。

支持 OpenAI Compatible 和 Anthropic 两种 API 格式，可配置多个测速计划并定时自动执行。

## 关于

本项目由 **MiniMax-M2.7** 和 **Xiaomi AI** 联合支持。

~~本项目完全由 小米 mimo-v2.5-pro 构建~~（没额度了，自力更生 🎯）

👉 在线看速度：[https://code.yangyangx.top/status](https://code.yangyangx.top/status)（作者的 coding plan 测速展示 ╮(╯▽╰)╭）

😭 来点 token 吧，再来点，我啥都愿意干 (≧◡≦)

### 小米 MiMo V2.5 体验

使用[我的邀请码](https://platform.xiaomimimo.com/console/balance?ref=283GAL)注册为新用户，即得 ¥10 API 体验金（40天有效）。

邀请码：**283GAL**

### MiniMax Token Plan

[立即参与 MiniMax 优惠活动 →](https://platform.minimaxi.com/subscribe/token-plan?code=BLzVdBvhGE&source=link)

## 功能

- 多 Token Plan 管理 — 自由组合 API 地址、模型、Prompt
- 定时测速 — 可配置检测频率 (1 分钟 ~ 数小时)
- 指标采集 — TTFT (ms)、TPS (overall / generate)、总 Token 数
- 数据可视化 — Dashboard 总览 + 历史趋势图
- Session 认证 — 首次启动自动生成管理员密码
- Docker 一键部署

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python 3.12, FastAPI, SQLAlchemy, aiosqlite, **psycopg3/asyncpg**, APScheduler |
| 数据库 | SQLite (默认), PostgreSQL (可选, 支持自动热迁移) |
| 前端 | React 19, TypeScript, TailwindCSS, shadcn/ui, Recharts |
| 包管理 | uv (Python), npm (Node) |
| 部署 | Docker, docker-compose |
| CI | GitHub Actions |

## 本机运行

### 前置依赖

- Python 3.12+
- Node.js 20+
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (Python 包管理)

### 安装

```bash
# 克隆仓库
git clone git@github.com:qingmuhy744/TokenMeter.git
cd TokenMeter

# 安装全部依赖 (Python + Node)
make install
```

等价于:
```bash
uv sync
cd frontend && npm install
```

### 开发模式

```bash
make dev
```

这会同时启动:
- 前端 Vite dev server (`http://localhost:5173`，自动代理 /api 请求)
- 后端 uvicorn (`http://localhost:8000`，热重载)

首次启动时，终端会打印管理员密码:

```
========================================
  Admin credentials
  Username: admin
  Password: xK9... (随机生成)
========================================
```

打开 `http://localhost:5173` 用该密码登录，登录后可在 Settings 页面修改密码。

### 构建前端

```bash
make build
```

构建产物在 `frontend/dist/`，后端会自动提供静态文件服务。

### 运行测试

```bash
make test
```

等价于:
```bash
uv run pytest -v           # 后端测试 (13 个)
cd frontend && npx tsc --noEmit  # 前端类型检查
```

### 代码检查

```bash
make lint
```

## 开发规范

### 格式化 (强制)

代码提交前必须通过格式化检查，由 [pre-commit](https://pre-commit.com/) 自动执行：

```bash
# 安装 pre-commit hook（首次克隆后只需运行一次）
pre-commit install

# 之后每次 git commit 会自动 format 代码
git commit -m "fix: ..."
```

Hook 会自动格式化 Python (`ruff format`) 和前端代码 (`eslint --fix`)，格式化后的文件会自动 staged。

如果 format 导致文件变更，commit 时会有提示，hook 不会阻止提交，只是确保代码格式统一。

## Docker 部署

### 使用预构建镜像 (推荐)

创建 `docker-compose.yml`:

```yaml
services:
  app:
    image: ghcr.io/qingmuhy744/tokenmeter:latest
    container_name: tokenmeter
    ports:
      - "8000:8000"
    volumes:
      - ./data:/data
    environment:
      - DB_PATH=/data/token_speed.db
      # SECRET_KEY=your-secret-key-here  # 不配置则自动生成随机密钥
```

启动:

```bash
docker compose up -d
```

访问 `http://localhost:8000`，管理员密码通过以下命令查看:

```bash
docker compose logs -f
```

数据保存在 `app-data` Docker volume 中，方便备份和迁移。

### 本地构建镜像

```bash
make docker
# 或
docker build -t token-speed-test .
```

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DB_PATH` | `token_speed.db` | SQLite 数据库文件路径 |
| `SECRET_KEY` | 随机生成 | Session 加密密钥，生产环境建议固定一个值 |
| `ADMIN_USER` | `admin` | 管理员用户名 |
| `HTTP_PROXY` | _(空)_ | HTTP 代理地址，如 `http://host.docker.internal:7890` |
| `HTTPS_PROXY` | _(空)_ | HTTPS 代理地址 |

docker-compose 中修改 `environment` 字段即可覆盖。

## 项目结构

```
TokenMeter/
├── backend/
│   ├── main.py              # FastAPI 入口
│   ├── config.py            # 环境变量配置
│   ├── database.py          # SQLAlchemy 异步引擎
│   ├── models.py            # ORM 模型 (TokenPlan, TestResult, User, Setting)
│   ├── schemas.py           # Pydantic 请求/响应模型
│   ├── auth.py              # 认证路由 + 密码工具
│   ├── routes/
│   │   ├── plans.py         # TokenPlan CRUD + 手动触发测速
│   │   ├── results.py       # 测速结果查询 + 统计
│   │   └── settings.py      # 全局设置
│   ├── services/
│   │   ├── speed_test.py    # 核心测速 (OpenAI / Anthropic SSE 流式解析)
│   │   └── scheduler.py     # APScheduler 定时任务管理
│   └── tests/               # 13 个 pytest 用例
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # 路由 + 布局
│   │   ├── api/client.ts    # API 客户端
│   │   ├── hooks/useAuth.ts # 认证 Hook
│   │   └── pages/           # Dashboard, Plans, History, Settings, Login, Status
│   └── ...
├── Dockerfile               # 多阶段构建
├── docker-compose.yml
├── Makefile
└── .github/workflows/ci.yml # GitHub Actions
```

## 测速原理

每个 Plan 配置 `test_count` 次测试，取中位数结果:

1. **TTFT** — 从请求发出到收到第一个 SSE chunk 的时间
2. **TPS (overall)** — 总 Token 数 / 总耗时 (含 TTFT)
3. **TPS (generate)** — 总 Token 数 / (总耗时 - TTFT)

使用 `time.monotonic()` 高精度计时，SSE 流式解析逐 chunk 统计 Token 数。

## GitHub Actions CI

推送到 `main` 或创建 PR 时自动运行:

1. Python lint (`ruff`) + 测试 (`pytest`)
2. 前端类型检查 (`tsc`) + 构建 (`vite build`)
3. Docker 构建并推送到 GHCR (仅 main 分支 push)
Hub Actions
```

## 测速原理

每个 Plan 配置 `test_count` 次测试，取中位数结果:

1. **TTFT** — 从请求发出到收到第一个 SSE chunk 的时间
2. **TPS (overall)** — 总 Token 数 / 总耗时 (含 TTFT)
3. **TPS (generate)** — 总 Token 数 / (总耗时 - TTFT)

使用 `time.monotonic()` 高精度计时，SSE 流式解析逐 chunk 统计 Token 数。

## GitHub Actions CI

推送到 `main` 或创建 PR 时自动运行:

1. Python lint (`ruff`) + 测试 (`pytest`)
2. 前端类型检查 (`tsc`) + 构建 (`vite build`)
3. Docker 构建并推送到 GHCR (仅 main 分支 push)
