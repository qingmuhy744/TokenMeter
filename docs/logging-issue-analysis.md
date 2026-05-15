# Docker 日志不可见问题分析

## 现象

`docker logs -f tokenmeter` 只显示 uvicorn 和 alembic 的输出，`logger.info("TokenMeter started")` 等应用日志不显示。

```
INFO:     Started server process [1]
INFO:     Waiting for application startup.
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transaction DDL.
# 以下内容从未出现：
# TokenMeter started
# [Scheduler] Running test: ...
```

## 根因

### 问题 1：uvicorn `dictConfig(disable_existing_loggers=True)`

uvicorn 启动时调用 `logging.config.dictConfig()`，配置中 `disable_existing_loggers=True`。这会把所有在 uvicorn 启动前创建的 logger 标记为 `disabled=True`，包括 `backend.main`、`backend.services.scheduler` 等应用 logger。后续 `logger.info()` 调用被直接丢弃，不传播到 root handler。

验证：在容器内模拟，dictConfig 之后 `backend.main.disabled == True`。

### 问题 2：alembic `fileConfig()` 二次覆盖

即使修了问题 1，lifespan 中 `alembic.command.upgrade()` 内部会执行 `alembic.ini` 的 `[loggers]` 配置，调用 `logging.config.fileConfig()`。这会：

1. 把 root logger 的 handler 替换成 alembic 自己的 StreamHandler（覆盖掉我们配置的 InterceptHandler）
2. 把 root logger level 设为 WARNING（alembic.ini 中 `[logger_root] level = WARNING`）
3. 再次 `disable_existing_loggers=True`

结果：InterceptHandler 被移除 + root level=WARNING → INFO 级别日志直接丢弃。

### 问题 3：stdout 缓冲

`print()` 在 Docker 容器中可能被缓冲（行缓冲或全缓冲），不会实时刷新到 docker logs。改用 `sys.stderr` sink 解决。

## 解决方案：loguru + InterceptHandler

### 架构

```
第三方库 (uvicorn, alembic, apscheduler)
  ↓ stdlib logging
InterceptHandler.emit()
  ↓ 转换 level + 透传
loguru.logger
  ↓ 两个 sink
  ├→ sys.stderr (docker logs 可见)
  └→ log_buffer   (/api/logs 端点)
```

### 为什么有效

1. **loguru 独立于 stdlib logging** — 不受 `dictConfig`/`fileConfig` 的 `disable_existing_loggers` 影响
2. **InterceptHandler 可被 `force=True` 恢复** — 在 alembic migration 之后重新 `logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)` 即可
3. **alembic 的 fileConfig 被禁用** — 通过 `alembic_cfg.set_main_option("configure_logger", "false")` 阻止 alembic 调用 `fileConfig()`
4. **`sys.stderr` sink 无缓冲问题**

### 关键代码

```python
# setup_logging: 配置 loguru 两个 sink + InterceptHandler 拦截所有 stdlib logging
def setup_logging():
    logger.remove()
    logger.add(sink_buffer, format=LOG_FORMAT, level="INFO")
    logger.add(sys.stderr, format=LOG_FORMAT, level="INFO")
    logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)

# lifespan: alembic 迁移前禁用 fileConfig，迁移后重新恢复 InterceptHandler
@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    alembic_cfg = alembic.config.Config("alembic.ini")
    alembic_cfg.set_main_option("configure_logger", "false")
    alembic.command.upgrade(alembic_cfg, "head")
    logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)
    ...

# alembic/env.py: 根据 configure_logger 选项跳过 fileConfig
if config.get_main_option("configure_logger") != "false":
    if config.config_file_name is not None:
        fileConfig(config.config_file_name)
```

## 之前的尝试（已废弃）

1. **`setup_logging()` 移到 lifespan 内** — 只解决问题 1（re-enable disabled loggers），不解决问题 2（alembic fileConfig 覆盖）
2. **遍历 `loggerDict` re-enable** — 只解决 disable 问题，不解决 handler 被替换和 level 被改的问题
3. **删除 alembic.ini 的 `[loggers]` 段** — 可以解决问题但不干净，`alembic` CLI 手动运行时会缺少日志

## 对比

| | stdlib logging | loguru + InterceptHandler |
|---|---|---|
| uvicorn 覆盖 | 受影响，logger 被 disable | 不受影响，loguru 独立体系 |
| alembic fileConfig | 覆盖 root handler 和 level | 被禁用（configure_logger=false）+ force=True 恢复 |
| 配置代码量 | BufferHandler + LocalTimeFormatter + re-enable hack | 2 个 sink + InterceptHandler |
| 时区 | 需自定义 Formatter | `{time}` 原生本地时区 |
| stdout 缓冲 | 需手动 flush | sys.stderr sink 无此问题 |

## 待研究

- uvicorn 的 `--log-config` 选项是否可以指定自定义 dictConfig，避免 `disable_existing_loggers=True`
- loguru 的 `enqueue=True` 是否能进一步提升异步日志性能
- 生产环境是否需要 log rotation（loguru 原生支持）