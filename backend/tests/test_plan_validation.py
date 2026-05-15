import pytest
from httpx import AsyncClient

from backend.models import TokenPlan


@pytest.mark.asyncio
async def test_reject_self_parent(auth_client: AsyncClient):
    response = await auth_client.post(
        "/api/plans",
        json={
            "name": "Self Parent",
            "api_type": "openai",
            "api_base": "https://api.openai.com/v1",
            "api_key": "sk-test",
            "model": "gpt-4",
        },
    )
    assert response.status_code == 200
    plan_id = response.json()["id"]

    update_response = await auth_client.put(
        f"/api/plans/{plan_id}", json={"parent_id": plan_id}
    )

    assert update_response.status_code == 400
    assert "parent" in update_response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_reject_cycle_parent(auth_client: AsyncClient):
    parent_response = await auth_client.post(
        "/api/plans",
        json={
            "name": "Cycle A",
            "api_type": "openai",
            "api_base": "https://api.openai.com/v1",
            "api_key": "sk-test",
            "model": "gpt-4",
        },
    )
    assert parent_response.status_code == 200
    parent_id = parent_response.json()["id"]

    child_response = await auth_client.post(
        "/api/plans",
        json={"name": "Cycle B", "parent_id": parent_id, "model": "gpt-4o"},
    )
    assert child_response.status_code == 200
    child_id = child_response.json()["id"]

    update_response = await auth_client.put(
        f"/api/plans/{parent_id}", json={"parent_id": child_id}
    )

    assert update_response.status_code == 400
    assert "cycle" in update_response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_reject_invalid_multiplier(auth_client: AsyncClient):
    response = await auth_client.post(
        "/api/plans",
        json={
            "name": "Invalid Multiplier",
            "parent_id": 1,
            "multiplier": 1.5,
            "model": "gpt-4o",
        },
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_root_plan_without_children_runs_as_single_plan(
    db_session,
    auth_client: AsyncClient,
    monkeypatch,
):
    from backend.routes import plans as plans_mod
    from backend.services.speed_test import SpeedTestResult

    plan = TokenPlan(
        name="Standalone Root",
        api_type="openai",
        api_base="https://api.openai.com/v1",
        api_key="sk-test",
        model="gpt-4",
        test_count=1,
        is_active=True,
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)

    async def fake_test_openai(*args, **kwargs):
        return SpeedTestResult(
            ttft_ms=100.0,
            tps_overall=10.0,
            tps_generate=12.0,
            total_tokens=10,
            total_time_ms=1000.0,
        )

    async def fail_suite(*args, **kwargs):
        raise AssertionError("standalone root plan should not run as a suite")

    monkeypatch.setattr(plans_mod.SpeedTester, "test_openai", fake_test_openai)
    monkeypatch.setattr("backend.services.scheduler.run_suite_test", fail_suite)

    response = await auth_client.post(f"/api/plans/{plan.id}/test")

    assert response.status_code == 200
    assert response.json()["message"] == "Test completed"
