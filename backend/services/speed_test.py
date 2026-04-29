import time
import json
import logging
import httpx
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class SpeedTestResult:
    ttft_ms: float | None = None
    tps_overall: float | None = None
    tps_generate: float | None = None
    total_tokens: int = 0
    total_time_ms: float | None = None
    error: str | None = None
    note: str | None = None
    debug_chunks: list[str] = field(default_factory=list)


class SpeedTester:
    def __init__(self, timeout: int = 30):
        self.timeout = timeout

    async def test_openai(
        self, api_base: str, api_key: str, model: str, prompt: str, max_tokens: int = 256
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
        return await self._stream_request(url, headers, body, self._parse_openai_chunk)

    async def test_anthropic(
        self, api_base: str, api_key: str, model: str, prompt: str, max_tokens: int = 256
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
        return await self._stream_request(url, headers, body, self._parse_anthropic_chunk)

    async def _stream_request(
        self, url: str, headers: dict, body: dict, parse_chunk
    ) -> SpeedTestResult:
        result = SpeedTestResult()
        start_time = time.monotonic()
        first_content_time = None   # TTFT: first content delta
        first_data_time = None      # Fallback TTFT: first data: line
        delta_count = 0             # Number of content deltas received
        raw_lines_seen = 0
        usage_tokens = 0            # Token count from usage field (authoritative)
        event_types_seen: set[str] = set()

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream("POST", url, headers=headers, json=body) as response:
                    logger.info("Response status: %d", response.status_code)
                    response.raise_for_status()
                    buffer = ""
                    current_event = ""
                    async for raw_bytes in response.aiter_bytes():
                        buffer += raw_bytes.decode("utf-8", errors="replace")
                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            line = line.strip()
                            if not line:
                                continue
                            raw_lines_seen += 1
                            if len(result.debug_chunks) < 5:
                                result.debug_chunks.append(line[:500])
                            # Track event type for Anthropic-style SSE
                            if line.startswith("event: "):
                                current_event = line[7:].strip()
                                event_types_seen.add(current_event)
                                continue
                            # Track first data: line
                            if line.startswith("data: ") and first_data_time is None:
                                first_data_time = time.monotonic()
                            # Check if this is a content delta (for TTFT)
                            has_content = parse_chunk(line, current_event) > 0
                            if has_content:
                                delta_count += 1
                                if first_content_time is None:
                                    first_content_time = time.monotonic()
                            # Always extract usage from data lines
                            if line.startswith("data: "):
                                try:
                                    data = json.loads(line[6:])
                                    usage = data.get("usage", {})
                                    if "output_tokens" in usage and usage["output_tokens"] > 0:
                                        usage_tokens = usage["output_tokens"]
                                    if "total_tokens" in usage and usage["total_tokens"] > 0:
                                        usage_tokens = usage["total_tokens"]
                                except (json.JSONDecodeError, AttributeError):
                                    pass
        except Exception as e:
            result.error = str(e)
            result.total_time_ms = (time.monotonic() - start_time) * 1000
            logger.error("Speed test failed: %s", e)
            return result

        end_time = time.monotonic()
        total_ms = (end_time - start_time) * 1000

        # --- Token count: prefer usage field, fallback to delta count ---
        if usage_tokens > 0:
            token_count = usage_tokens
            if delta_count == 0:
                result.note = "Token count from usage (no content deltas parsed)"
            else:
                result.note = f"Token count from usage ({delta_count} deltas received)"
        elif delta_count > 0:
            token_count = delta_count
            result.note = "Token count from stream deltas (no usage field)"
        else:
            token_count = 0
            if raw_lines_seen > 0:
                result.note = f"0 tokens from {raw_lines_seen} lines. Events: {sorted(event_types_seen)}"

        result.total_tokens = token_count
        result.total_time_ms = total_ms

        # --- TTFT: first content delta > first data line > N/A ---
        if first_content_time is not None:
            result.ttft_ms = (first_content_time - start_time) * 1000
        elif first_data_time is not None and token_count > 0:
            result.ttft_ms = (first_data_time - start_time) * 1000

        # --- TPS ---
        if token_count > 0 and result.ttft_ms and result.ttft_ms > 0:
            generate_ms = total_ms - result.ttft_ms
            if generate_ms > 0:
                result.tps_overall = token_count / (total_ms / 1000)
                result.tps_generate = token_count / (generate_ms / 1000)

        logger.info(
            "Test done: tokens=%d (usage=%d, deltas=%d) ttft=%.0fms tps=%.1f total=%.0fms events=%s",
            token_count, usage_tokens, delta_count,
            result.ttft_ms or 0, result.tps_overall or 0, total_ms,
            sorted(event_types_seen),
        )

        return result

    @staticmethod
    def _parse_openai_chunk(line: str, event_type: str = "") -> int:
        if line == "data: [DONE]":
            return 0
        if not line.startswith("data: "):
            return 0
        try:
            data = json.loads(line[6:])
            # Standard OpenAI: choices[0].delta.content
            choices = data.get("choices", [])
            if choices:
                delta = choices[0].get("delta", {})
                content = delta.get("content", "")
                if content:
                    return 1
            # Some providers put content directly in delta
            delta = data.get("delta", {})
            if delta.get("content"):
                return 1
        except json.JSONDecodeError:
            pass
        return 0

    @staticmethod
    def _parse_anthropic_chunk(line: str, event_type: str = "") -> int:
        if not line.startswith("data: "):
            return 0
        try:
            data = json.loads(line[6:])
            data_type = data.get("type", "")
            # Match by event_type from event: line OR by type field in data
            is_delta = (
                data_type == "content_block_delta"
                or event_type == "content_block_delta"
            )
            if is_delta:
                delta = data.get("delta", {})
                # Standard: delta.text
                text = delta.get("text", "")
                if text:
                    return 1
                # Fallback: delta.content (some providers)
                content = delta.get("content", "")
                if isinstance(content, str) and content:
                    return 1
                # Fallback: content_block with inline text
                cb = data.get("content_block", {})
                if cb.get("text"):
                    return 1
        except json.JSONDecodeError:
            pass
        return 0
