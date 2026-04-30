import time
import json
import logging
import httpx
from dataclasses import dataclass, field
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


@dataclass
class RequestTracker:
    """Tracks timing and token state for a single streaming request."""

    time_sent: float
    time_first_token: float | None = None
    time_finished: float | None = None
    char_count: int = 0
    delta_count: int = 0
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    cache_read: int | None = None
    is_finished: bool = False
    error: str | None = None


class BaseParser(ABC):
    """Abstract base for SSE stream parsers."""

    @abstractmethod
    def parse_line(self, line: str, tracker: RequestTracker, now: float) -> int:
        """Parse a single SSE line. Returns char_count delta. Updates tracker state."""
        pass

    @abstractmethod
    def is_done(self, tracker: RequestTracker) -> bool:
        """Returns True if stream has reached terminal state."""
        pass


class OpenAIParser(BaseParser):
    """Parser for OpenAI-compatible /v1/chat/completions SSE streams."""

    def __init__(self):
        self._seen_done = False
        self._finish_reason: str | None = None

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

        # T1: first non-empty delta.content
        if tracker.time_first_token is None:
            choices = data.get("choices", [])
            if choices:
                delta = choices[0].get("delta", {})
                content = delta.get("content", "")
                if content:
                    tracker.time_first_token = now
                    tracker.char_count += len(content)
                    tracker.delta_count += 1
                    return len(content)

        # Track content even after first token
        choices = data.get("choices", [])
        if choices:
            delta = choices[0].get("delta", {})
            content = delta.get("content", "")
            if content:
                tracker.char_count += len(content)
                tracker.delta_count += 1

        # Capture usage (authoritative for token counts)
        usage = data.get("usage", {})
        if usage:
            if usage.get("prompt_tokens"):
                tracker.input_tokens = usage["prompt_tokens"]
            if usage.get("completion_tokens"):
                tracker.output_tokens = usage["completion_tokens"]
            if usage.get("total_tokens"):
                tracker.total_tokens = usage["total_tokens"]

        # Early finish_reason (don't exit yet — must wait for [DONE] or usage)
        choices = data.get("choices", [])
        if choices and choices[0].get("finish_reason"):
            self._finish_reason = choices[0]["finish_reason"]
            if tracker.time_finished is None:
                tracker.time_finished = now

        return 0

    def is_done(self, tracker: RequestTracker) -> bool:
        return self._seen_done


class AnthropicParser(BaseParser):
    """Parser for Anthropic /v1/messages SSE streams."""

    def __init__(self):
        self._current_event: str = ""

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

        elif data_type == "content_block_delta":
            delta = data.get("delta", {})
            text = delta.get("text", "")
            thinking = delta.get("thinking", "")

            # T1: first non-empty text or thinking
            if tracker.time_first_token is None and (text or thinking):
                tracker.time_first_token = now

            if text:
                tracker.char_count += len(text)
                tracker.delta_count += 1
            if thinking:
                tracker.char_count += len(thinking)
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

    def is_done(self, tracker: RequestTracker) -> bool:
        return tracker.is_finished


@dataclass
class SpeedTestResult:
    ttft_ms: float | None = None
    tps_overall: float | None = None
    tps_generate: float | None = None
    total_tokens: int = 0
    total_time_ms: float | None = None
    input_tokens: int | None = None
    cache_read: int | None = None
    char_count: int | None = None
    token_density: float | None = None
    error: str | None = None
    note: str | None = None
    debug_chunks: list[str] = field(default_factory=list)


class SpeedTester:
    def __init__(self, timeout: int = 30):
        self.timeout = timeout

    async def test_openai(
        self,
        api_base: str,
        api_key: str,
        model: str,
        prompt: str,
        max_tokens: int = 256,
    ) -> SpeedTestResult:
        url = f"{api_base.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "stream": True,
        }
        logger.info("Testing OpenAI-compatible: %s model=%s", url, model)
        return await self._stream_request(url, headers, body, OpenAIParser())

    async def test_anthropic(
        self,
        api_base: str,
        api_key: str,
        model: str,
        prompt: str,
        max_tokens: int = 256,
    ) -> SpeedTestResult:
        url = f"{api_base.rstrip('/')}/v1/messages"
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        body = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "stream": True,
        }
        logger.info("Testing Anthropic: %s model=%s", url, model)
        return await self._stream_request(url, headers, body, AnthropicParser())

    async def _stream_request(
        self, url: str, headers: dict, body: dict, parser: BaseParser
    ) -> SpeedTestResult:
        tracker = RequestTracker(time_sent=time.monotonic())
        result = SpeedTestResult()
        last_chunk_time = tracker.time_sent
        debug_chunks: list[str] = []

        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(
                    connect=10.0,
                    read=float(self.timeout),
                    write=10.0,
                    pool=10.0,
                ),
                trust_env=True,
            ) as client:
                async with client.stream(
                    "POST", url, headers=headers, json=body
                ) as response:
                    logger.info("Response status: %d", response.status_code)
                    response.raise_for_status()
                    buffer = ""
                    async for raw_bytes in response.aiter_bytes():
                        buffer += raw_bytes.decode("utf-8", errors="replace")
                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            line = line.strip()
                            if not line:
                                continue
                            last_chunk_time = time.monotonic()
                            if len(debug_chunks) < 5:
                                debug_chunks.append(line[:500])
                            parser.parse_line(line, tracker, last_chunk_time)
                            if parser.is_done(tracker):
                                break
        except httpx.TimeoutException as e:
            tracker.error = f"Timeout: {e}"
            tracker.time_finished = last_chunk_time
            logger.error("Speed test timeout: %s", e)
        except Exception as e:
            tracker.error = str(e)
            tracker.time_finished = last_chunk_time
            logger.error("Speed test failed: %s", e)

        total_ms = (tracker.time_finished or tracker.time_sent) - tracker.time_sent

        # Detect dangling stream
        if not tracker.is_finished and tracker.time_finished:
            if tracker.error is None:
                tracker.error = "incomplete stream"

        result.debug_chunks = debug_chunks
        result.input_tokens = tracker.input_tokens
        result.cache_read = tracker.cache_read
        result.char_count = tracker.char_count
        result.total_time_ms = total_ms * 1000
        result.error = tracker.error

        output_tokens = tracker.output_tokens or tracker.total_tokens or 0
        if output_tokens == 0 and tracker.delta_count > 0:
            output_tokens = tracker.delta_count
            result.note = f"Token count from stream deltas (no usage field). Events: {tracker.is_finished}"

        if output_tokens == 0:
            result.note = f"No output tokens. Events: {tracker.is_finished}"
            result.total_tokens = tracker.total_tokens or 0
            return result

        result.total_tokens = output_tokens

        if tracker.time_first_token is not None:
            result.ttft_ms = (tracker.time_first_token - tracker.time_sent) * 1000
            generate_ms = (
                tracker.time_finished or tracker.time_sent
            ) - tracker.time_first_token
            if generate_ms > 0:
                result.tps_overall = output_tokens / (total_ms)
                result.tps_generate = output_tokens / (generate_ms)
                if tracker.char_count > 0:
                    result.token_density = tracker.char_count / output_tokens

        logger.info(
            "Test done: tokens=%d char_count=%d ttft=%.0fms tps=%.1f density=%.2f error=%s",
            output_tokens,
            tracker.char_count,
            result.ttft_ms or 0,
            result.tps_overall or 0,
            result.token_density or 0,
            tracker.error or "",
        )
        return result
