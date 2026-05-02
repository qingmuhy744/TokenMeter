# 思考链隔离设计规格

## 背景

当前探针将思考内容（`<think>` 标签、`reasoning_content` 字段、Anthropic `thinking` 字段）
与正文内容同等处理：TTFT 在第一个有内容的 chunk 就打点，`char_count` 包含思考文本。
这导致 MiniMax-M2.5 等带思考的模型报告 TTFT 极快（实际是思考开始），与用户体感割裂。

## 核心原则

1. TTFT 必须是用户看到正文首字的那一刻
2. 思考过程隔离为独立指标
3. 无思考内容的流完全兼容，行为不变
4. 全量数据存储，用不用再说

## 方案：解析器内状态机

在 `OpenAIParser` 和 `AnthropicParser` 内部维护思考状态机（IDLE → THINKING → CONTENT），
`RequestTracker` 新增字段记录完整时间线。

### 状态机

三种状态：`IDLE`、`THINKING`、`CONTENT`

**OpenAI 格式状态转换：**

| 当前状态 | 触发条件 | 动作 | 新状态 |
|---------|---------|------|--------|
| IDLE | `reasoning_content` 非空 | 记录 `time_first_reasoning`，累加 `thinking_char_count` | THINKING |
| IDLE | `content` 含 `<think>` | `<think>` 前的文本归正文，`<think>` 后的文本归思考；记录 `time_first_reasoning` | THINKING |
| IDLE | `content` 非空且无 `<think>` | 记录 `time_first_token`（TTFT），累加 `content_char_count` | CONTENT |
| THINKING | `reasoning_content` 非空 | 累加 `thinking_char_count` | THINKING |
| THINKING | `content` 含 `</think>` | `</think>` 后的文本归正文（纯空白跳过）；记录 `time_think_end` | CONTENT |
| THINKING | `content` 非空无 `</think>` | 累加 `thinking_char_count` | THINKING |
| CONTENT | `content` 非空 | 累加 `content_char_count`；若 `time_first_token` 未设则设置 | CONTENT |
| CONTENT | `reasoning_content` 非空 | 累加 `thinking_char_count`（罕见：思考后再次思考） | THINKING |

**Anthropic 格式状态转换：**

| 当前状态 | 触发条件 | 动作 | 新状态 |
|---------|---------|------|--------|
| IDLE | `delta.thinking` 非空 | 记录 `time_first_reasoning`，累加 `thinking_char_count` | THINKING |
| IDLE | `delta.text` 非空 | 记录 `time_first_token`，累加 `content_char_count` | CONTENT |
| THINKING | `delta.thinking` 非空 | 累加 `thinking_char_count` | THINKING |
| THINKING | `delta.text` 非空 | 记录 `time_think_end`，累加 `content_char_count` | CONTENT |
| CONTENT | `delta.text` 非空 | 累加 `content_char_count` | CONTENT |

**边界情况：**
- `<think>` 和内容在同一 chunk：按标签位置分割
- `</think>` 后紧跟 `\n\n` 纯空白：跳过，不算正文首字
- 无思考内容的流：`time_first_reasoning` 和 `time_think_end` 为 None，行为不变
- 思考后再次出现思考（多轮推理）：重新进入 THINKING 状态

### RequestTracker 新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `time_first_byte` | `float \| None` | 收到第一个 HTTP 字节的时刻 |
| `time_first_reasoning` | `float \| None` | 第一个思考内容到达的时刻 |
| `time_think_end` | `float \| None` | 思考结束的时刻 |
| `content_char_count` | `int` | 正文部分字符数 |
| `thinking_char_count` | `int` | 思考部分字符数 |

### SpeedTestResult / DB / Schema 新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `ttfb_ms` | `float \| None` | Time To First Byte（网络+排队） |
| `ttfr_ms` | `float \| None` | Time To First Reasoning |
| `think_time_ms` | `float \| None` | 思考耗时 |
| `content_tokens` | `int \| None` | 正文 token 数 |
| `thinking_tokens` | `int \| None` | 思考 token 数 |
| `tps_content` | `float \| None` | 有效信息 TPS |
| `content_char_count` | `int \| None` | 正文字符数 |
| `thinking_char_count` | `int \| None` | 思考字符数 |
| `ping_ms` | `float \| None` | 剔除异常后的 ping 中值 |
| `ping_samples` | `JSON` | 原始 ping RTT 样本列表 |

### 完整时间线

```
ping_ms (独立并行测量)
time_sent → time_first_byte → time_first_reasoning → time_think_end → time_first_token → time_finished
```

### 衍生指标计算

- `ttfb_ms` = `(time_first_byte - time_sent) * 1000`
- `ttfr_ms` = `(time_first_reasoning - time_sent) * 1000`
- `think_time_ms` = `(time_think_end - time_first_reasoning) * 1000`
- `ttft_ms` = `(time_first_token - time_sent) * 1000`（有思考时为正文首字，无思考时行为不变）
- `token_density` = `char_count / output_tokens`（整体）
- `thinking_tokens` = `thinking_char_count / token_density`
- `content_tokens` = `output_tokens - thinking_tokens`
- `tps_overall` = `output_tokens / total_ms`（不变）
- `tps_generate` = `output_tokens / generate_ms`（不变）
- `tps_content` = `content_tokens / (time_finished - time_first_token)`（正文生成阶段）

### Ping 测量

**执行方式：**
- 流式请求发起的同时，启动并行 ping 协程
- 固定 1s 间隔持续发送 HTTP HEAD 到 `api_base` 的 host
- 流式请求结束后 ping 协程停止
- 短请求 2-3 个样本，长请求 10+ 个样本

**软剔除规则：**
- IQR 方法：超出 Q1 - 1.5×IQR 或 Q3 + 1.5×IQR 标记为异常
- `ping_ms` 取非异常样本的中值
- 样本数 ≤ 2 不剔除，直接取中值
- 原始数据全部保留在 `ping_samples`

### DB 迁移

新增 SQL：

```sql
ALTER TABLE test_results ADD COLUMN ttfb_ms FLOAT;
ALTER TABLE test_results ADD COLUMN ttfr_ms FLOAT;
ALTER TABLE test_results ADD COLUMN think_time_ms FLOAT;
ALTER TABLE test_results ADD COLUMN content_tokens INTEGER;
ALTER TABLE test_results ADD COLUMN thinking_tokens INTEGER;
ALTER TABLE test_results ADD COLUMN tps_content FLOAT;
ALTER TABLE test_results ADD COLUMN content_char_count INTEGER;
ALTER TABLE test_results ADD COLUMN thinking_char_count INTEGER;
ALTER TABLE test_results ADD COLUMN ping_ms FLOAT;
ALTER TABLE test_results ADD COLUMN ping_samples TEXT;  -- JSON array
```

SQLite 和 PostgreSQL 均兼容。`ping_samples` 用 TEXT 存 JSON（SQLite 无原生 JSON 类型）。

### 前端展示

所有新指标始终展示，无思考内容时显示 "-" 或 "N/A"。

### 向后兼容

- 无思考内容的流：`ttfr_ms`、`think_time_ms`、`thinking_tokens`、`thinking_char_count` 为 None
- `ttft_ms` 行为不变（仍是首字延迟）
- 现有数据不受影响（新字段全部 nullable）
- `ping_samples` 为 None 表示未测量

### 测试覆盖

已有 `test_stream_parser.py` 覆盖 MiniMax-M2.5、DeepSeek、标准 OpenAI、Anthropic 四种格式。
需新增测试：
- 思考状态机转换（IDLE → THINKING → CONTENT）
- `<think>` 和内容在同一 chunk 的分割
- `</think>` 后纯空白跳过
- 无思考内容的流兼容性
- 多轮推理（思考 → 正文 → 再次思考）
- `time_first_byte` 打点
- ping 并行测量和软剔除
- 衍生指标计算（ttfr_ms、think_time_ms、tps_content 等）