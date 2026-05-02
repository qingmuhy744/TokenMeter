import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_trigger_manual_test_regression(db_session, auth_client: AsyncClient):
    """Regression test for the AttributeError in trigger_test endpoint."""
    # 1. Create a plan to test
    resp = await auth_client.post(
        "/api/plans",
        json={
            "name": "Regression Test Plan",
            "api_type": "openai",
            "api_base": "https://api.openai.com/v1",
            "api_key": "sk-test",
            "model": "gpt-4o",
            "test_count": 1,
        },
    )
    assert resp.status_code == 200
    plan_id = resp.json()["id"]

    # 2. Trigger manual test
    # We need to mock the actual speed test to avoid networking
    from unittest.mock import patch
    from backend.services.speed_test import SpeedTestResult

    mock_result = SpeedTestResult(
        ttft_ms=100.0,
        tps_overall=10.0,
        total_tokens=10,
        total_time_ms=1000.0,
        # Ensure all fields that were causing AttributeError are present
        ttfb_ms=50.0,
        ttfr_ms=75.0,
        think_time_ms=25.0,
        content_tokens=8,
        thinking_tokens=2,
        tps_content=12.0,
        content_char_count=40,
        thinking_char_count=10,
        ping_ms=5.0,
        ping_samples=[5.0],
    )

    with patch(
        "backend.services.speed_test.SpeedTester.test_openai", return_value=mock_result
    ):
        resp = await auth_client.post(f"/api/plans/{plan_id}/test")

        # If the AttributeError is present, this will be 500
        assert resp.status_code == 200
        assert resp.json()["message"] == "Test completed"
