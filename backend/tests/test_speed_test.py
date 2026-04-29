import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from backend.services.speed_test import SpeedTester


@pytest.mark.asyncio
async def test_speed_tester_openai_format():
    tester = SpeedTester(timeout=10)

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()

    chunks = [
        b'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        b'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        b'data: [DONE]\n\n',
    ]

    async def mock_aiter_bytes():
        for chunk in chunks:
            yield chunk

    mock_response.aiter_bytes = mock_aiter_bytes

    with patch("backend.services.speed_test.httpx.AsyncClient") as MockClient:
        instance = MagicMock()
        mock_stream_ctx = MagicMock()
        mock_stream_ctx.__aenter__ = AsyncMock(return_value=mock_response)
        mock_stream_ctx.__aexit__ = AsyncMock(return_value=False)
        instance.stream.return_value = mock_stream_ctx
        MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
        MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await tester.test_openai(
            api_base="https://api.openai.com/v1",
            api_key="sk-test",
            model="gpt-4o",
            prompt="Say hi",
            max_tokens=10,
        )

        assert result.error is None
        assert result.total_tokens >= 2
        assert result.ttft_ms is not None
        assert result.tps_overall is not None


@pytest.mark.asyncio
async def test_speed_tester_handles_error():
    tester = SpeedTester(timeout=10)

    with patch("backend.services.speed_test.httpx.AsyncClient") as MockClient:
        instance = MagicMock()
        instance.stream.side_effect = Exception("Connection refused")
        MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
        MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await tester.test_openai(
            api_base="https://api.openai.com/v1",
            api_key="sk-test",
            model="gpt-4o",
            prompt="test",
            max_tokens=10,
        )

        assert result.error is not None
        assert "Connection refused" in result.error
