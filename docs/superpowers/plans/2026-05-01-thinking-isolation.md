# 思考链隔离实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在速度测试探针中隔离思考/推理内容，新增 TTFR、Think Time、TTFB、Ping 等指标，TTFT 重新定义为正文首字延迟。

**架构：** 在 OpenAIParser/AnthropicParser 内部维护 IDLE→THINKING→CONTENT 状态机，RequestTracker 新增时间戳和字符计数字段，SpeedTestResult/DB/Schema 新增 10 个字段，Ping 与流式请求并行执行。

**技术栈：** Python 3.12, FastAPI, SQLAlchemy (async), httpx, pytest

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `backend/services/speed_test.py` | 解析器、Tracker、SpeedTester 主逻辑 | 修改 |
| `backend/models.py` | TestResult ORM 模型 | 修改 |
| `backend/schemas.py` | Pydantic 请求/响应 schema | 修改 |
| `backend/migrations/manager.py` | Schema 版本迁移 | 修改 |
| `backend/tests/test_stream_parser.py` | 流解析器单元测试 | 修改 |
| `backend/tests/test_speed_test.py` | SpeedTester 集成测试 | 修改 |
| `frontend/src/api/client.ts` | 前端 TypeScript 类型定义 | 修改 |
| `frontend/src/pages/Status.tsx` | 结果展示页面 | 修改 |

---

### 任务 1：RequestTracker 新增字段

**文件：**
- 修改：`backend/services/speed_test.py`（`RequestTracker` dataclass，第 11-25 行）

- [ ] **步骤 1：在 RequestTracker 中新增字段**

将 `RequestTracker` 改为：

```python
@dataclass
class RequestTracker:
    """Tracks timing and token state for a single streaming request."""

    time_sent: float
    time_first_byte: float | None = None
    time_first_token: float | None = None
    time_first_reasoning: float | None = None
    time_think_end: float | None = None
    time_finished: float | None = None
    char_count: int = 0
    content_char_count: int = 0
    thinking_char_count: int = 0
    delta_count: int = 0
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    cache_read: int | None = None
    is_finished: bool = False
    error: str | None = None
```

- [ ] **步骤 2：运行现有测试确认不破坏**

运行：`uv run pytest backend/tests/test_stream_parser.py backend/tests/test_speed_test.py -v`
预期：全部 PASS

- [ ] **步骤 3：Commit**

```bash
git add backend/services/speed_test.py
git commit -m "feat: add thinking isolation fields to RequestTracker"
```

---

### 任务 2：OpenAIParser 思考状态机

**文件：**
- 修改：`backend/services/speed_test.py`（`OpenAIParser` 类，第 42-98 行）
- 修改：`backend/tests/test_stream_parser.py`

- [ ] **步骤 1：编写思考状态机的失败测试**

在 `test_stream_parser.py` 的 `TestMiniMaxM25Stream` 类中添加：

```python
def test_thinking_chars_separated_from_content(self, minimax_lines):
    """思考内容计入 thinking_char_count，正文计入 content_char_count。"""
    parser = OpenAIParser()
    tracker = parse_lines(parser, minimax_lines)
    assert tracker.thinking_char_count > 0
    assert tracker.content_char_count > 0
    assert tracker.thinking_char_count + tracker.content_char_count == tracker.char_count

def test_time_first_reasoning_captured(self, minimax_lines):
    """TTFR 在第一个思考内容到达时打点。"""
    parser = OpenAIParser()
    tracker = parse_lines(parser, minimax_lines)
    assert tracker.time_first_reasoning is not None

def test_time_think_end_captured(self, minimax_lines):
    """思考结束时间在遇到 </think> 时打点。"""
    parser = OpenAIParser()
    tracker = parse_lines(parser, minimax_lines)
    assert tracker.time_think_end is not None

def test_ttft_is_content_first_token(self, minimax_lines):
    """TTFT 应该是正文首字，不是思考首字。"""
    parser = OpenAIParser()
    tracker = parse_lines(parser, minimax_lines)
    assert tracker.time_first_token is not None
    assert tracker.time_first_token > tracker.time_first_reasoning
```

在文件末尾新增测试类：

```python
class TestOpenAIThinkingStateMachine:
    """测试 OpenAI 解析器的思考状态机转换。"""

    def test_no_thinking_stays_idle(self):
        """无思考内容的流始终在 IDLE/CONTENT 状态。"""
        lines = [
            make_openai_chunk(content="Hello"),
            make_openai_chunk(content=" world"),
            make_openai_chunk(finish_reason="stop"),
            "data: [DONE]",
        ]
        parser = OpenAIParser()
        tracker = parse_lines(parser, lines)
        assert tracker.time_first_reasoning is None
        assert tracker.time_think_end is None
        assert tracker.thinking_char_count == 0
        assert tracker.content_char_count == 11

    def test_think_tag_split_in_same_chunk(self):
        """<think> 和正文在同一 chunk 时，按标签位置分割。"""
        lines = [
            make_openai_chunk(content="prefix<think>thinking"),
            make_openai_chunk(content=" more"),
            make_openai_chunk(content="</think>suffix"),
            "data: [DONE]",
        ]
        parser = OpenAIParser()
        tracker = parse_lines(parser, lines)
        assert tracker.content_char_count == len("prefix") + len("suffix")
        assert tracker.thinking_char_count > 0

    def test_whitespace_after_think_end_skipped(self):
        """</think> 后紧跟的纯空白不算正文首字。"""
        lines = [
            make_openai_chunk(content="<think>hmm"),
            make_openai_chunk(content="</think>"),
            make_openai_chunk(content="\n\n"),
            make_openai_chunk(content="real content"),
            "data: [DONE]",
        ]
        parser = OpenAIParser()
        tracker = parse_lines(parser, lines, base_time=0.0, step=0.01)
        # time_first_token 应该在 "real content" 那个 chunk，不是 \n\n
        assert tracker.time_first_token is not None
        assert tracker.content_char_count == len("real content")

    def test_reasoning_content_field_triggers_thinking(self):
        """delta.reasoning_content 非空时进入 THINKING 状态。"""
        lines = [
            make_openai_chunk(reasoning_content="Let me think"),
            make_openai_chunk(reasoning_content=" more"),
            make_openai_chunk(content="The answer"),
            "data: [DONE]",
        ]
        parser = OpenAIParser()
        tracker = parse_lines(parser, lines)
        assert tracker.time_first_reasoning is not None
        assert tracker.time_think_end is not None
        assert tracker.thinking_char_count == len("Let me think") + len(" more")
        assert tracker.content_char_count == len("The answer")

    def test_multi_round_thinking(self):
        """思考→正文→再次思考的状态转换。"""
        lines = [
            make_openai_chunk(reasoning_content="first think"),
            make_openai_chunk(content="some content"),
            make_openai_chunk(reasoning_content="second think"),
            make_openai_chunk(content="more content"),
            "data: [DONE]",
        ]
        parser = OpenAIParser()
        tracker = parse_lines(parser, lines)
        assert tracker.thinking_char_count == len("first think") + len("second think")
        assert tracker.content_char_count == len("some content") + len("more content")
```

- [ ] **步骤 2：运行测试验证失败**

运行：`uv run pytest backend/tests/test_stream_parser.py -v -k "thinking_chars_separated or time_first_reasoning or time_think_end or ttft_is_content or ThinkingState"`
预期：FAIL（解析器尚未实现状态机）

- [ ] **步骤 3：实现 OpenAIParser 思考状态机**

将 `OpenAIParser` 改为：

```python
class OpenAIParser(BaseParser):
    """Parser for OpenAI-compatible /v1/chat/completions SSE streams."""

    def __init__(self):
        self._seen_done = False
        self._finish_reason: str | None = None
        self._is_thinking = False

    def parse_line(self, line: str, tracker: RequestTracker, now: float) -> int:
        if line == "data: [DONE]":
            self._seen_done = True
            tracker.time_finished = now
            tracker.is_finished = True
            return 0
        if not line.startswith("data: "):
            return 0
        try:
            data = json.loads(line[6:])
        except json.JSONDecodeError:
            return 0

        choices = data.get("choices", [])
        char_delta = 0
        if choices:
            delta = choices[0].get("delta", {})
            content = delta.get("content", "")
            reasoning = delta.get("reasoning_content", "")

            # --- 思考状态机 ---
            if reasoning:
                # reasoning_content 字段 → 思考内容
                if tracker.time_first_reasoning is None:
                    tracker.time_first_reasoning = now
                self._is_thinking = True
                tracker.thinking_char_count += len(reasoning)
                tracker.char_count += len(reasoning)
                tracker.delta_count += 1
                char_delta += len(reasoning)

            if content:
                if self._is_thinking:
                    # 当前在思考状态，检查是否包含 </think>
                    if "</think>" in content:
                        # 思考结束
                        idx = content.index("</think>")
                        before = content[:idx]
                        after = content[idx + len("</think>"):]
                        # 标签前的内容归思考
                        if before:
                            tracker.thinking_char_count += len(before)
                            tracker.char_count += len(before)
                            char_delta += len(before)
                        tracker.time_think_end = now
                        self._is_thinking = False
                        # 标签后的内容：纯空白跳过，否则归正文
                        if after.strip():
                            if tracker.time_first_token is None:
                                tracker.time_first_token = now
                            tracker.content_char_count += len(after)
                            tracker.char_count += len(after)
                            tracker.delta_count += 1
                            char_delta += len(after)
                    else:
                        # 思考中的内容
                        tracker.thinking_char_count += len(content)
                        tracker.char_count += len(content)
                        tracker.delta_count += 1
                        char_delta += len(content)
                else:
                    # 不在思考状态，检查是否包含 <think>
                    if "<think>" in content:
                        idx = content.index("<think>")
                        before = content[:idx]
                        after = content[idx + len("<think>"):]
                        # 标签前的内容归正文
                        if before:
                            if tracker.time_first_token is None:
                                tracker.time_first_token = now
                            tracker.content_char_count += len(before)
                            tracker.char_count += len(before)
                            tracker.delta_count += 1
                            char_delta += len(before)
                        # 进入思考状态
                        if tracker.time_first_reasoning is None:
                            tracker.time_first_reasoning = now
                        self._is_thinking = True
                        # 标签后的内容归思考
                        if after:
                            tracker.thinking_char_count += len(after)
                            tracker.char_count += len(after)
                            tracker.delta_count += 1
                            char_delta += len(after)
                    else:
                        # 普通正文内容
                        # 纯空白在刚退出思考后跳过（不触发 TTFT）
                        if tracker.time_think_end is not None and not content.strip():
                            tracker.char_count += len(content)
                            char_delta += len(content)
                        else:
                            if tracker.time_first_token is None:
                                tracker.time_first_token = now
                            tracker.content_char_count += len(content)
                            tracker.char_count += len(content)
                            tracker.delta_count += 1
                            char_delta += len(content)

            # Early finish_reason
            if choices[0].get("finish_reason"):
                self._finish_reason = choices[0]["finish_reason"]
                if tracker.time_finished is None:
                    tracker.time_finished = now

        # Capture usage
        usage = data.get("usage", {})
        if usage:
            if usage.get("prompt_tokens"):
                tracker.input_tokens = usage["prompt_tokens"]
            if usage.get("completion_tokens"):
                tracker.output_tokens = usage["completion_tokens"]
            if usage.get("total_tokens"):
                tracker.total_tokens = usage["total_tokens"]

        return char_delta
```

- [ ] **步骤 4：运行测试验证通过**

运行：`uv run pytest backend/tests/test_stream_parser.py -v`
预期：全部 PASS

- [ ] **步骤 5：Commit**

```bash
git add backend/services/speed_test.py backend/tests/test_stream_parser.py
git commit -m "feat: implement thinking state machine in OpenAIParser"
```

---

### 任务 3：AnthropicParser 思考状态机

**文件：**
- 修改：`backend/services/speed_test.py`（`AnthropicParser` 类，第 101-155 行）
- 修改：`backend/tests/test_stream_parser.py`

- [ ] **步骤 1：编写 Anthropic 思考状态机的失败测试**

在 `test_stream_parser.py` 的 `TestAnthropicStream` 类中添加：

```python
def test_thinking_separated_from_content(self):
    """Anthropic 格式：thinking 和 text 分别计入。"""
    lines = [
        "event: message_start",
        'data: {"type": "message_start", "message": {"usage": {"input_tokens": 10}}}',
        "event: content_block_delta",
        'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "thinking_delta", "thinking": "Let me think..."}}',
        "event: content_block_delta",
        'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "The answer is 42"}}',
        "event: message_delta",
        'data: {"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 5}}',
        "event: message_stop",
        'data: {"type": "message_stop"}',
    ]
    parser = AnthropicParser()
    tracker = parse_lines(parser, lines)
    assert tracker.thinking_char_count == len("Let me think...")
    assert tracker.content_char_count == len("The answer is 42")
    assert tracker.time_first_reasoning is not None
    assert tracker.time_think_end is not None
    # TTFT 应在 text_delta，不在 thinking_delta
    assert tracker.time_first_token > tracker.time_first_reasoning

def test_no_thinking_anthropic(self):
    """无 thinking 的 Anthropic 流：思考字段为 None。"""
    lines = [
        "event: message_start",
        'data: {"type": "message_start", "message": {"usage": {"input_tokens": 5}}}',
        "event: content_block_delta",
        'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Hello"}}',
        "event: message_delta",
        'data: {"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 1}}',
        "event: message_stop",
        'data: {"type": "message_stop"}',
    ]
    parser = AnthropicParser()
    tracker = parse_lines(parser, lines)
    assert tracker.time_first_reasoning is None
    assert tracker.time_think_end is None
    assert tracker.thinking_char_count == 0
    assert tracker.content_char_count == len("Hello")
```

- [ ] **步骤 2：运行测试验证失败**

运行：`uv run pytest backend/tests/test_stream_parser.py -v -k "Anthropic and (thinking_separated or no_thinking_anthropic)"`
预期：FAIL

- [ ] **步骤 3：实现 AnthropicParser 思考状态机**

将 `AnthropicParser` 改为：

```python
class AnthropicParser(BaseParser):
    """Parser for Anthropic /v1/messages SSE streams."""

    def __init__(self):
        self._current_event: str = ""
        self._is_thinking = False

    def parse_line(self, line: str, tracker: RequestTracker, now: float) -> int:
        if line.startswith("event: "):
            self._current_event = line[7:].strip()
            return 0
        if not line.startswith("data: "):
            return 0
        try:
            data = json.loads(line[6:])
        except json.JSONDecodeError:
            return 0

        data_type = data.get("type", "")

        if data_type == "message_start":
            usage = data.get("message", {}).get("usage", {})
            tracker.input_tokens = usage.get("input_tokens")
            tracker.cache_read = usage.get("cache_read_input_tokens")

        elif data_type == "content_block_start":
            # Anthropic 用 content_block_start 标记块类型
            block = data.get("content_block", {})
            if block.get("type") == "thinking":
                self._is_thinking = True
            elif block.get("type") == "text":
                self._is_thinking = False

        elif data_type == "content_block_delta":
            delta = data.get("delta", {})
            text = delta.get("text", "")
            thinking = delta.get("thinking", "")

            if thinking:
                if tracker.time_first_reasoning is None:
                    tracker.time_first_reasoning = now
                self._is_thinking = True
                tracker.thinking_char_count += len(thinking)
                tracker.char_count += len(thinking)
                tracker.delta_count += 1

            if text:
                if self._is_thinking:
                    # 退出思考状态
                    if tracker.time_think_end is None:
                        tracker.time_think_end = now
                    self._is_thinking = False
                if tracker.time_first_token is None:
                    tracker.time_first_token = now
                tracker.content_char_count += len(text)
                tracker.char_count += len(text)
                tracker.delta_count += 1

        elif data_type == "message_delta":
            usage = data.get("usage", {})
            if usage.get("output_tokens"):
                tracker.output_tokens = usage["output_tokens"]
            if usage.get("tokens"):
                tracker.total_tokens = usage["tokens"]

        elif data_type == "message_stop":
            tracker.time_finished = now
            tracker.is_finished = True

        return 0
```

- [ ] **步骤 4：运行测试验证通过**

运行：`uv run pytest backend/tests/test_stream_parser.py -v`
预期：全部 PASS

- [ ] **步骤 5：Commit**

```bash
git add backend/services/speed_test.py backend/tests/test_stream_parser.py
git commit -m "feat: implement thinking state machine in AnthropicParser"
```

---

### 任务 4：SpeedTestResult 新增字段和衍生指标计算

**文件：**
- 修改：`backend/services/speed_test.py`（`SpeedTestResult` dataclass 和 `_stream_request` 方法）

- [ ] **步骤 1：扩展 SpeedTestResult dataclass**

将 `SpeedTestResult` 改为：

```python
@dataclass
class SpeedTestResult:
    ttft_ms: float | None = None
    ttfb_ms: float | None = None
    ttfr_ms: float | None = None
    think_time_ms: float | None = None
    tps_overall: float | None = None
    tps_generate: float | None = None
    tps_content: float | None = None
    total_tokens: int = 0
    total_time_ms: float | None = None
    input_tokens: int | None = None
    cache_read: int | None = None
    char_count: int | None = None
    content_char_count: int | None = None
    thinking_char_count: int | None = None
    content_tokens: int | None = None
    thinking_tokens: int | None = None
    token_density: float | None = None
    ping_ms: float | None = None
    ping_samples: list[float] = field(default_factory=list)
    error: str | None = None
    note: str | None = None
    debug_chunks: list[str] = field(default_factory=list)
```

- [ ] **步骤 2：在 `_stream_request` 中记录 `time_first_byte`**

在 `_stream_request` 方法中，`async with client.stream(...)` 进入后立即打点：

```python
async with client.stream(
    "POST", url, headers=headers, json=body
) as response:
    logger.info("Response status: %d", response.status_code)
    response.raise_for_status()
    tracker.time_first_byte = time.monotonic()
    # ... 后续逻辑不变
```

- [ ] **步骤 3：在 `_stream_request` 末尾计算衍生指标**

在现有的 `if tracker.time_first_token is not None:` 块中，替换为：

```python
if tracker.time_first_byte is not None:
    result.ttfb_ms = (tracker.time_first_byte - tracker.time_sent) * 1000

if tracker.time_first_reasoning is not None:
    result.ttfr_ms = (tracker.time_first_reasoning - tracker.time_sent) * 1000

if tracker.time_first_reasoning is not None and tracker.time_think_end is not None:
    result.think_time_ms = (tracker.time_think_end - tracker.time_first_reasoning) * 1000

if tracker.time_first_token is not None:
    result.ttft_ms = (tracker.time_first_token - tracker.time_sent) * 1000
    generate_ms = (
        tracker.time_finished or tracker.time_sent
    ) - tracker.time_first_token
    if generate_ms > 0:
        result.tps_overall = output_tokens / (total_ms)
        result.tps_generate = output_tokens / (
            (tracker.time_finished or tracker.time_sent) - tracker.time_first_token + (result.ttft_ms / 1000)
        )
        # 修正：tps_generate 用 (time_finished - time_first_token) 更准确
        result.tps_generate = output_tokens / generate_ms
        if tracker.char_count > 0:
            result.token_density = tracker.char_count / output_tokens

        # 思考/正文 token 分拆
        if tracker.thinking_char_count > 0 and result.token_density and result.token_density > 0:
            result.thinking_tokens = round(tracker.thinking_char_count / result.token_density)
            result.content_tokens = output_tokens - result.thinking_tokens
            if result.content_tokens > 0 and generate_ms > 0:
                result.tps_content = result.content_tokens / generate_ms
        elif tracker.thinking_char_count == 0:
            # 无思考内容，content_tokens = output_tokens
            result.content_tokens = output_tokens
            result.thinking_tokens = 0
            result.tps_content = result.tps_generate
```

同时添加 `content_char_count` 和 `thinking_char_count` 到 result 赋值区域：

```python
result.content_char_count = tracker.content_char_count
result.thinking_char_count = tracker.thinking_char_count
```

- [ ] **步骤 4：运行全量测试**

运行：`uv run pytest backend/tests/test_stream_parser.py backend/tests/test_speed_test.py -v`
预期：全部 PASS

- [ ] **步骤 5：Commit**

```bash
git add backend/services/speed_test.py
git commit -m "feat: add thinking-derived metrics to SpeedTestResult"
```

---

### 任务 5：Ping 并行测量

**文件：**
- 修改：`backend/services/speed_test.py`（`SpeedTester` 类）

- [ ] **步骤 1：编写 ping 测量函数**

在 `SpeedTester` 类中添加：

```python
async def _measure_ping(
    self, url: str, interval: float = 1.0, event: asyncio.Event | None = None
) -> list[float]:
    """并行 ping：固定间隔发 HTTP HEAD，直到 event 被设置。"""
    samples: list[float] = []
    parsed = urlparse(url)
    ping_url = f"{parsed.scheme}://{parsed.netloc}"
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(connect=5.0, read=5.0),
        trust_env=True,
    ) as client:
        while event is None or not event.is_set():
            start = time.monotonic()
            try:
                await client.head(ping_url)
            except Exception:
                pass
            else:
                rtt = (time.monotonic() - start) * 1000
                samples.append(rtt)
            if event and event.is_set():
                break
            await asyncio.sleep(interval)
    return samples
```

需要在文件顶部添加 `import asyncio` 和 `from urllib.parse import urlparse`。

- [ ] **步骤 2：编写软剔除函数**

```python
def _clean_ping_samples(samples: list[float]) -> float | None:
    """IQR 软剔除后取中值。"""
    if not samples:
        return None
    if len(samples) <= 2:
        return sorted(samples)[len(samples) // 2]
    s = sorted(samples)
    q1 = s[len(s) // 4]
    q3 = s[3 * len(s) // 4]
    iqr = q3 - q1
    lo = q1 - 1.5 * iqr
    hi = q3 + 1.5 * iqr
    cleaned = [x for x in s if lo <= x <= hi]
    if not cleaned:
        return s[len(s) // 2]
    return cleaned[len(cleaned) // 2]
```

- [ ] **步骤 3：在 `_stream_request` 中并行启动 ping**

在 `_stream_request` 方法中，发起流式请求前创建 ping 协程：

```python
async def _stream_request(
    self, url: str, headers: dict, body: dict, parser: BaseParser
) -> SpeedTestResult:
    tracker = RequestTracker(time_sent=time.monotonic())
    result = SpeedTestResult()
    last_chunk_time = tracker.time_sent
    debug_chunks: list[str] = []
    ping_done = asyncio.Event()
    ping_task = asyncio.create_task(
        self._measure_ping(url, interval=1.0, event=ping_done)
    )

    try:
        async with httpx.AsyncClient(...) as client:
            async with client.stream(...) as response:
                # ... 现有逻辑不变 ...
    except ...:
        # ... 现有逻辑不变 ...
    finally:
        ping_done.set()

    # 收集 ping 结果
    try:
        ping_samples = await ping_task
    except Exception:
        ping_samples = []
    result.ping_samples = ping_samples
    result.ping_ms = _clean_ping_samples(ping_samples)

    # ... 后续指标计算逻辑不变 ...
```

- [ ] **步骤 4：编写 ping 测试**

在 `test_stream_parser.py` 末尾添加：

```python
from backend.services.speed_test import _clean_ping_samples

class TestPingCleaning:
    def test_empty_samples(self):
        assert _clean_ping_samples([]) is None

    def test_two_samples_median(self):
        assert _clean_ping_samples([10.0, 20.0]) == 20.0  # sorted[1]

    def test_iqr_outlier_removed(self):
        # [5, 10, 12, 14, 100] — 100 是异常值
        result = _clean_ping_samples([5.0, 10.0, 12.0, 14.0, 100.0])
        assert result is not None
        assert result < 50.0  # 100 应被剔除
```

- [ ] **步骤 5：运行测试**

运行：`uv run pytest backend/tests/test_stream_parser.py -v -k "PingCleaning"`
预期：PASS

- [ ] **步骤 6：Commit**

```bash
git add backend/services/speed_test.py backend/tests/test_stream_parser.py
git commit -m "feat: add parallel ping measurement with IQR cleaning"
```

---

### 任务 6：DB 模型和迁移

**文件：**
- 修改：`backend/models.py`（`TestResult` 类）
- 修改：`backend/migrations/manager.py`（`MIGRATIONS` 列表）

- [ ] **步骤 1：在 TestResult 模型中新增字段**

在 `TestResult` 类的 `token_density` 之后添加：

```python
    ttfb_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    ttfr_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    think_time_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    content_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    thinking_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tps_content: Mapped[float | None] = mapped_column(Float, nullable=True)
    content_char_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    thinking_char_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ping_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    ping_samples: Mapped[str | None] = mapped_column(Text, nullable=True)
```

- [ ] **步骤 2：在 MIGRATIONS 列表中添加新迁移**

在 `manager.py` 的 `MIGRATIONS` 列表末尾添加（版本号 0.1.1，因为当前最新是 0.2.0 的 rehash 迁移）：

```python
    (
        "0.2.1",
        "sql",
        textwrap.dedent("""
        ALTER TABLE test_results ADD COLUMN ttfb_ms FLOAT;
        ALTER TABLE test_results ADD COLUMN ttfr_ms FLOAT;
        ALTER TABLE test_results ADD COLUMN think_time_ms FLOAT;
        ALTER TABLE test_results ADD COLUMN content_tokens INTEGER;
        ALTER TABLE test_results ADD COLUMN thinking_tokens INTEGER;
        ALTER TABLE test_results ADD COLUMN tps_content FLOAT;
        ALTER TABLE test_results ADD COLUMN content_char_count INTEGER;
        ALTER TABLE test_results ADD COLUMN thinking_char_count INTEGER;
        ALTER TABLE test_results ADD COLUMN ping_ms FLOAT;
        ALTER TABLE test_results ADD COLUMN ping_samples TEXT;
    """).strip(),
    ),
```

注意：当前 MIGRATIONS 列表有 0.1.0 和 0.2.0 两条迁移。0.2.1 追加到列表末尾即可。

- [ ] **步骤 3：更新迁移测试**

在 `test_migration_integration.py` 中：

1. `test_run_migrations_sqlite_to_pg_e2e`：第 158 行断言 `version_setting.value == "0.2.1"`（更新为新的最终版本）

2. `test_password_rehash_migration`：第 206 行断言 `res.scalar_one().value == "0.2.1"`（更新为新的最终版本）

3. `test_migration_transaction_idempotency`：不变（它验证最终版本等于 `MIGRATIONS[-1][0]`）

4. 新增测试：验证 0.1.1 迁移正确添加列

```python
@pytest.mark.asyncio
async def test_thinking_isolation_migration(db_engine):
    """Test that 0.1.1 migration adds thinking isolation columns."""
    db_url = os.getenv("TEST_DATABASE_URL", "")
    if "postgresql" not in db_url:
        pytest.skip("PostgreSQL specific migration test")

    async_session = async_sessionmaker(db_engine, class_=AsyncSession)

    # 1. Set version to 0.2.0 so 0.2.1 migration runs
    async with async_session() as session:
        res = await session.execute(select(Setting).where(Setting.key == "db_version"))
        s = res.scalar_one_or_none()
        if s:
            s.value = "0.2.0"
        else:
            session.add(Setting(key="db_version", value="0.2.0"))
        await session.commit()

    # 2. Run migrations
    async with async_session() as session:
        await run_migrations(session)

    # 3. Verify new columns exist by inserting a result with them
    async with async_session() as session:
        result = TestResult(
            plan_id=1,
            ttfb_ms=50.0,
            ttfr_ms=100.0,
            think_time_ms=3500.0,
            content_tokens=40,
            thinking_tokens=20,
            tps_content=80.0,
            content_char_count=160,
            thinking_char_count=80,
            ping_ms=15.0,
            ping_samples='[10.0, 15.0, 20.0]',
        )
        session.add(result)
        await session.commit()

        # Read back
        res = await session.execute(select(TestResult).where(TestResult.id == result.id))
        r = res.scalar_one()
        assert r.ttfb_ms == 50.0
        assert r.ttfr_ms == 100.0
        assert r.think_time_ms == 3500.0
        assert r.content_tokens == 40
        assert r.thinking_tokens == 20
        assert r.tps_content == 80.0
        assert r.ping_ms == 15.0
        assert r.ping_samples == '[10.0, 15.0, 20.0]'

        # Verify version advanced past 0.2.1
        res = await session.execute(select(Setting).where(Setting.key == "db_version"))
        version = res.scalar_one().value
        assert version >= "0.2.1"
```

- [ ] **步骤 4：运行测试确认不破坏**

运行：`uv run pytest backend/tests/ -v --ignore=backend/tests/test_migration_integration.py`
预期：全部 PASS

- [ ] **步骤 5：Commit**

```bash
git add backend/models.py backend/migrations/manager.py backend/tests/test_migration_integration.py
git commit -m "feat: add thinking isolation fields to DB model, migration v0.2.1, and tests"
```

---

### 任务 7：Pydantic Schema 更新

**文件：**
- 修改：`backend/schemas.py`（`TestResultResponse` 和 `StatsResponse`）

- [ ] **步骤 1：在 TestResultResponse 中新增字段**

在 `token_density` 之后添加：

```python
    ttfb_ms: float | None = None
    ttfr_ms: float | None = None
    think_time_ms: float | None = None
    content_tokens: int | None = None
    thinking_tokens: int | None = None
    tps_content: float | None = None
    content_char_count: int | None = None
    thinking_char_count: int | None = None
    ping_ms: float | None = None
    ping_samples: str | None = None  # JSON array as string
```

- [ ] **步骤 2：在 StatsResponse 中新增思考相关统计**

```python
class StatsResponse(BaseModel):
    plan_id: int
    count: int
    avg_ttft_ms: float | None
    avg_tps_overall: float | None
    avg_tps_generate: float | None
    avg_think_time_ms: float | None = None
    avg_tps_content: float | None = None
    median_ttft_ms: float | None
    median_tps_overall: float | None
    p95_ttft_ms: float | None
```

- [ ] **步骤 3：更新 results 路由中的 stats 计算**

在 `backend/routes/results.py` 中，stats 端点的聚合查询需要添加 `avg_think_time_ms` 和 `avg_tps_content` 的计算。找到 stats 端点中构建 `StatsResponse` 的位置，添加：

```python
avg_think_time_ms=...,
avg_tps_content=...,
```

具体实现取决于现有聚合方式（需要读取 `results.py` 确认）。

- [ ] **步骤 4：运行测试**

运行：`uv run pytest backend/tests/ -v --ignore=backend/tests/test_migration_integration.py`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add backend/schemas.py backend/routes/results.py
git commit -m "feat: add thinking isolation fields to Pydantic schemas and stats"
```

---

### 任务 8：前端类型和展示更新

**文件：**
- 修改：`frontend/src/api/client.ts`
- 修改：`frontend/src/pages/Status.tsx`

- [ ] **步骤 1：更新 TestResult TypeScript 接口**

在 `client.ts` 的 `TestResult` 接口中，`token_density` 之后添加：

```typescript
  ttfb_ms?: number | null;
  ttfr_ms?: number | null;
  think_time_ms?: number | null;
  content_tokens?: number | null;
  thinking_tokens?: number | null;
  tps_content?: number | null;
  content_char_count?: number | null;
  thinking_char_count?: number | null;
  ping_ms?: number | null;
  ping_samples?: string | null;
```

- [ ] **步骤 2：更新 Stats 接口**

```typescript
export interface Stats {
  plan_id: number;
  count: number;
  avg_ttft_ms: number | null;
  avg_tps_overall: number | null;
  avg_tps_generate: number | null;
  avg_think_time_ms: number | null;
  avg_tps_content: number | null;
  median_ttft_ms: number | null;
  median_tps_overall: number | null;
  p95_ttft_ms: number | null;
}
```

- [ ] **步骤 3：更新 Status 页面展示**

在 `Status.tsx` 的状态卡片中，现有 3 列（TTFT / TPS Overall / TPS Generate）扩展为更多列。在 `latest_result` 接口中添加新字段，在卡片渲染中添加：

```tsx
<div className="grid grid-cols-3 gap-2 text-sm">
  <div>
    <p className="text-muted-foreground">TTFT</p>
    <p className="text-lg font-semibold">{plan.latest_result.ttft_ms ?? "—"}ms</p>
  </div>
  <div>
    <p className="text-muted-foreground">Think Time</p>
    <p className="text-lg font-semibold">{plan.latest_result.think_time_ms != null ? `${plan.latest_result.think_time_ms}ms` : "—"}</p>
  </div>
  <div>
    <p className="text-muted-foreground">TPS Content</p>
    <p className="text-lg font-semibold">{plan.latest_result.tps_content ?? "—"}</p>
  </div>
</div>
<div className="grid grid-cols-3 gap-2 text-sm mt-1">
  <div>
    <p className="text-muted-foreground">TTFB</p>
    <p className="text-lg font-semibold">{plan.latest_result.ttfb_ms != null ? `${plan.latest_result.ttfb_ms}ms` : "—"}</p>
  </div>
  <div>
    <p className="text-muted-foreground">TPS Overall</p>
    <p className="text-lg font-semibold">{plan.latest_result.tps_overall ?? "—"}</p>
  </div>
  <div>
    <p className="text-muted-foreground">Ping</p>
    <p className="text-lg font-semibold">{plan.latest_result.ping_ms != null ? `${plan.latest_result.ping_ms}ms` : "—"}</p>
  </div>
</div>
```

- [ ] **步骤 4：验证前端构建**

运行：`cd frontend && npm run build`
预期：构建成功

- [ ] **步骤 5：Commit**

```bash
git add frontend/src/api/client.ts frontend/src/pages/Status.tsx
git commit -m "feat: add thinking isolation metrics to frontend"
```

---

### 任务 9：集成测试和全量验证

**文件：**
- 修改：`backend/tests/test_speed_test.py`

- [ ] **步骤 1：更新现有集成测试**

在 `test_speed_tester_openai_format` 中，添加新字段断言：

```python
assert result.ttfb_ms is not None
assert result.content_char_count is not None
assert result.thinking_char_count == 0  # 无思考内容
assert result.content_tokens is not None
assert result.thinking_tokens == 0
assert result.tps_content is not None
```

- [ ] **步骤 2：运行全量测试（含迁移测试）**

运行：`uv run pytest backend/tests/ -v`
预期：全部 PASS

- [ ] **步骤 3：运行 lint**

运行：`uv run ruff check backend/ && uv run ruff format --check backend/`
预期：无错误

- [ ] **步骤 4：Commit**

```bash
git add backend/tests/test_speed_test.py
git commit -m "test: update integration tests for thinking isolation"
```
