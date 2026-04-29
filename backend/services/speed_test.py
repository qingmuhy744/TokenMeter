import time
import json
import httpx
from dataclasses import dataclass


@dataclass
class SpeedTestResult:
    ttft_ms: float | None = None
    tps_overall: float | None = None
    tps_generate: float | None = None
    total_tokens: int = 0
    total_time_ms: float | None = None
    error: str | None = None


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
        return await self._stream_request(url, headers, body, self._parse_anthropic_chunk)

    async def _stream_request(
        self, url: str, headers: dict, body: dict, parse_chunk
    ) -> SpeedTestResult:
        result = SpeedTestResult()
        start_time = time.monotonic()
        first_chunk_time = None
        token_count = 0

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream("POST", url, headers=headers, json=body) as response:
                    response.raise_for_status()
                    buffer = ""
                    async for raw_bytes in response.aiter_bytes():
                        buffer += raw_bytes.decode("utf-8", errors="replace")
                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            line = line.strip()
                            if not line:
                                continue
                            tokens = parse_chunk(line)
                            if tokens > 0:
                                if first_chunk_time is None:
                                    first_chunk_time = time.monotonic()
                                token_count += tokens
        except Exception as e:
            result.error = str(e)
            result.total_time_ms = (time.monotonic() - start_time) * 1000
            return result

        end_time = time.monotonic()
        total_ms = (end_time - start_time) * 1000

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

        return result

    @staticmethod
    def _parse_openai_chunk(line: str) -> int:
        if line == "data: [DONE]":
            return 0
        if not line.startswith("data: "):
            return 0
        try:
            data = json.loads(line[6:])
            choices = data.get("choices", [])
            if choices:
                delta = choices[0].get("delta", {})
                content = delta.get("content", "")
                if content:
                    return 1
        except json.JSONDecodeError:
            pass
        return 0

    @staticmethod
    def _parse_anthropic_chunk(line: str) -> int:
        if not line.startswith("data: "):
            return 0
        try:
            data = json.loads(line[6:])
            if data.get("type") == "content_block_delta":
                delta = data.get("delta", {})
                text = delta.get("text", "")
                if text:
                    return 1
        except json.JSONDecodeError:
            pass
        return 0
