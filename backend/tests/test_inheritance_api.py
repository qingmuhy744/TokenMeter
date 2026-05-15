import pytest
from httpx import AsyncClient
from unittest.mock import patch
from backend.models import TokenPlan
from backend.services.speed_test import SpeedTestResult


@pytest.mark.asyncio
async def test_inheritance_trigger_test(db_session, auth_client: AsyncClient):
    # 1. 创建父计划
    parent_resp = await auth_client.post(
        "/api/plans",
        json={
            "name": "Parent Suite",
            "api_type": "openai",
            "api_base": "https://api.openai.com/v1",
            "api_key": "sk-parent-key",
            "model": "gpt-4",
        },
    )
    assert parent_resp.status_code == 200
    parent_id = parent_resp.json()["id"]

    # 2. 创建子计划，只提供 model
    child_resp = await auth_client.post(
        "/api/plans",
        json={
            "name": "Child Model",
            "parent_id": parent_id,
            "model": "gpt-3.5-turbo",
        },
    )
    assert child_resp.status_code == 200
    child_id = child_resp.json()["id"]

    # 验证子计划在 DB 中的字段确实为 None
    data = child_resp.json()
    assert data["api_type"] is None
    assert "api_key" not in data
    assert data["has_api_key"] is False

    # 3. 模拟 SpeedTester.test_openai 并触发手动测试
    mock_result = SpeedTestResult(
        ttft_ms=100,
        tps_overall=50,
        tps_generate=60,
        total_tokens=100,
        total_time_ms=2000,
        input_tokens=10,
        error=None,
    )

    with patch(
        "backend.routes.plans.SpeedTester.test_openai", return_value=mock_result
    ) as mock_test:
        test_resp = await auth_client.post(f"/api/plans/{child_id}/test")
        assert test_resp.status_code == 200

        # 验证 mock_test 被调用时的参数是否继承自父计划
        mock_test.assert_called()
        args, kwargs = mock_test.call_args
        # args: (api_base, api_key, model, prompt, max_tokens)
        assert args[0] == "https://api.openai.com/v1"  # api_base
        assert args[1] == "sk-parent-key"  # api_key
        assert args[2] == "gpt-3.5-turbo"  # model (child's own)


@pytest.mark.asyncio
async def test_inheritance_max_depth(db_session, auth_client: AsyncClient):
    # 创建 A (key-0) -> B -> C -> D -> E

    # A
    resp = await auth_client.post(
        "/api/plans", json={"name": "A", "api_key": "key-0", "api_type": "openai"}
    )
    id_a = resp.json()["id"]

    # B
    resp = await auth_client.post("/api/plans", json={"name": "B", "parent_id": id_a})
    id_b = resp.json()["id"]

    # C
    resp = await auth_client.post("/api/plans", json={"name": "C", "parent_id": id_b})
    id_c = resp.json()["id"]

    # D
    resp = await auth_client.post("/api/plans", json={"name": "D", "parent_id": id_c})
    id_d = resp.json()["id"]

    # E
    resp = await auth_client.post("/api/plans", json={"name": "E", "parent_id": id_d})
    id_e = resp.json()["id"]

    from backend.database import async_session
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload

    async with async_session() as db:
        # 1. 测试 D (depth 3 from A: D->C, C->B, B->A)
        # 应该能拿到 key-0
        result = await db.execute(
            select(TokenPlan)
            .options(
                joinedload(TokenPlan.parent)
                .joinedload(TokenPlan.parent)
                .joinedload(TokenPlan.parent)
            )
            .where(TokenPlan.id == id_d)
        )
        plan_d = result.scalar_one()
        assert plan_d.effective_api_key == "key-0"

        # 2. 测试 E (depth 4 from A)
        # 即使加载了所有父级，默认 max_depth=3 也会在 E->D, D->C, C->B 停止，拿不到 A 的 key-0
        result = await db.execute(
            select(TokenPlan)
            .options(
                joinedload(TokenPlan.parent)
                .joinedload(TokenPlan.parent)
                .joinedload(TokenPlan.parent)
                .joinedload(TokenPlan.parent)
            )
            .where(TokenPlan.id == id_e)
        )
        plan_e = result.scalar_one()
        # E -> D (1), D -> C (2), C -> B (3). At B, max_depth becomes 0, it returns B.api_key which is None.
        assert plan_e.effective_api_key is None

        # 3. 手动调用更大深度
        assert plan_e.get_effective_value("api_key", max_depth=4) == "key-0"


@pytest.mark.asyncio
async def test_effective_api_key_is_not_returned_full_in_response(
    db_session,
    auth_client: AsyncClient,
):
    """API response should not return raw effective API keys to the browser."""
    parent_resp = await auth_client.post(
        "/api/plans",
        json={
            "name": "Parent",
            "api_type": "openai",
            "api_base": "https://api.openai.com/v1",
            "api_key": "sk-parent-secret-key-long",
            "model": "gpt-4",
        },
    )
    parent_id = parent_resp.json()["id"]

    child_resp = await auth_client.post(
        "/api/plans",
        json={
            "name": "Child",
            "parent_id": parent_id,
            "model": "gpt-3.5-turbo",
        },
    )
    data = child_resp.json()

    assert "effective_api_key" not in data
    assert data["has_effective_api_key"] is True
    assert "sk-parent-secret-key-long" not in str(data)


@pytest.mark.asyncio
async def test_plan_response_effective_values_not_included_by_default(
    auth_client: AsyncClient,
):
    # Verify that PlanResponse returns raw values (None for child)
    parent_resp = await auth_client.post(
        "/api/plans",
        json={
            "name": "Parent",
            "api_type": "openai",
            "api_base": "https://api.openai.com/v1",
            "api_key": "sk-parent",
            "model": "gpt-4",
        },
    )
    parent_id = parent_resp.json()["id"]

    child_resp = await auth_client.post(
        "/api/plans",
        json={
            "name": "Child",
            "parent_id": parent_id,
            "model": "gpt-3.5-turbo",
        },
    )
    data = child_resp.json()
    assert data["api_type"] is None
    assert data["api_base"] is None
    assert "api_key" not in data
    assert data["has_api_key"] is False
    assert data["model"] == "gpt-3.5-turbo"
