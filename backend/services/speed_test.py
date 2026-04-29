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
        first_chunk_time = None
        token_count = 0
        raw_lines_seen = 0
        usage_tokens = 0  # Fallback: extract from usage field in final message

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
                            # Store first 10 non-empty lines for debugging
                            if len(result.debug_chunks) < 10:
                                result.debug_chunks.append(line[:500])
                            # Track event type for Anthropic-style SSE (event: and data: on separate lines)
                            if line.startswith("event: "):
                                current_event = line[7:].strip()
                                continue
                            tokens = parse_chunk(line, current_event)
                            if tokens > 0:
                                if first_chunk_time is None:
                                    first_chunk_time = time.monotonic()
                                    logger.debug("First token at %.1fms", (first_chunk_time - start_time) * 1000)
                                token_count += tokens
                            # Try extracting usage from message_delta or message_stop
                            if line.startswith("data: "):
                                try:
                                    data = json.loads(line[6:])
                                    # Anthropic-style: usage.output_tokens in message_delta
                                    usage = data.get("usage", {})
                                    if "output_tokens" in usage and usage["output_tokens"] > 0:
                                        usage_tokens = usage["output_tokens"]
                                    # OpenAI-style: usage.total_tokens (some providers put it in last chunk)
                                    if "total_tokens" in usage and usage["total_tokens"] > 0:
                                        usage_tokens = usage["total_tokens"]
                                except (json.JSONDecodeError, AttributeError):
                                    pass
                            if raw_lines_seen <= 5:
                                logger.debug("Line %d: %s", raw_lines_seen, line[:200])
        except Exception as e:
            result.error = str(e)
            result.total_time_ms = (time.monotonic() - start_time) * 1000
            logger.error("Speed test failed: %s", e)
            return result

        end_time = time.monotonic()
        total_ms = (end_time - start_time) * 1000

        # Fallback: use usage tokens if stream parsing found 0
        if token_count == 0 and usage_tokens > 0:
            logger.info("Stream parsing got 0 tokens, using usage.output_tokens=%d", usage_tokens)
            token_count = usage_tokens
            result.note = "Token count from usage field (stream parsing did not find content deltas)"

        result.total_tokens = token_count
        result.total_time_ms = total_ms

        if first_chunk_time is not None:
            ttft_ms = (first_chunk_time - start_time) * 1000
            result.ttft_ms = ttft_ms
            if token_count > 0:
                generate_ms = total_ms - ttft_ms
                if generate_ms > 0:
                    result.tps_overall = token_count / (total_ms / 1000)
                    result.tps_generate = token_count / (generate_ms / 1000)

        logger.info(
            "Test done: tokens=%d usage=%d lines=%d ttft=%.0fms total=%.0fms",
            token_count, usage_tokens, raw_lines_seen,
            result.ttft_ms or 0, total_ms,
        )

        if token_count == 0 and raw_lines_seen > 0:
            result.note = f"Stream OK but 0 tokens parsed ({raw_lines_seen} SSE lines). API may use non-standard format."
            logger.warning("0 tokens from %d lines. First chunks: %s", raw_lines_seen, result.debug_chunks[:3])

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
