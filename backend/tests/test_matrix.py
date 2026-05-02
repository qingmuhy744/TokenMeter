import pytest
from httpx import AsyncClient
from datetime import datetime, timedelta, timezone
from backend.models import TokenPlan, TestResult


@pytest.mark.asyncio
async def test_get_matrix(auth_client: AsyncClient, db_session):
    # 1. Create Plans
    parent = TokenPlan(name="Provider A", is_active=True)
    db_session.add(parent)
    await db_session.flush()

    child = TokenPlan(name="Model X", parent_id=parent.id, is_active=True)
    db_session.add(child)
    await db_session.flush()

    # 2. Create Results
    now = datetime.now(timezone.utc)

    # Successful result - Night (02:00 UTC, if tz_offset=0)
    res1 = TestResult(
        plan_id=child.id,
        ttft_ms=100.0,
        tps_overall=10.0,
        tps_generate=12.0,
        created_at=now.replace(hour=2, minute=0),
        error=None,
    )
    # Successful result - Day (10:00 UTC, if tz_offset=0)
    res2 = TestResult(
        plan_id=child.id,
        ttft_ms=200.0,
        tps_overall=5.0,
        tps_generate=6.0,
        created_at=now.replace(hour=10, minute=0),
        error=None,
    )
    # Error result
    res3 = TestResult(
        plan_id=child.id, created_at=now - timedelta(hours=1), error="Some error"
    )

    db_session.add_all([res1, res2, res3])
    await db_session.commit()

    # 3. Request Matrix
    resp = await auth_client.get(
        "/api/results/matrix", params={"days": 1, "tz_offset": 0}
    )
    assert resp.status_code == 200
    data = resp.json()

    # Should have 2 plans (Provider A and Model X)
    # But wait, Provider A is also active.
    # Usually we only care about "leaf" plans?
    # Requirement doesn't specify, but I included all active plans.

    child_entry = next((item for item in data if item["plan_id"] == child.id), None)
    assert child_entry is not None
    assert child_entry["full_name"] == "Provider A > Model X"

    # Calculations:
    # avg_ttft = (100 + 200) / 2 = 150
    # day_avg_ttft = 200 (at 10:00)
    # night_avg_ttft = 100 (at 02:00)
    # degradation = (200 - 100) / 100 = 1.0
    # success_rate = 2 / 3 = 0.666...

    assert child_entry["avg_ttft"] == 150.0
    assert child_entry["day_avg_ttft"] == 200.0
    assert child_entry["night_avg_ttft"] == 100.0
    assert child_entry["degradation"] == 1.0
    assert abs(child_entry["success_rate"] - 0.6666) < 0.01

    # Sparkline should contain ttft values in order
    # Depending on 'now', res1 and res2 might or might not be in last 24h.
    # In this test, they are likely in last 24h.
    assert len(child_entry["sparkline"]) >= 2


@pytest.mark.asyncio
async def test_matrix_timezone(auth_client: AsyncClient, db_session):
    parent = TokenPlan(name="Provider B", is_active=True)
    db_session.add(parent)
    await db_session.flush()
    child = TokenPlan(name="Model Y", parent_id=parent.id, is_active=True)
    db_session.add(child)
    await db_session.flush()

    # UTC 00:00 is Day in UTC+8 (08:00)
    res = TestResult(
        plan_id=child.id,
        ttft_ms=500.0,
        created_at=datetime.now(timezone.utc).replace(hour=0, minute=0),
        error=None,
    )
    db_session.add(res)
    await db_session.commit()

    # With tz_offset=480 (UTC+8), it should be Day
    resp = await auth_client.get(
        "/api/results/matrix", params={"days": 1, "tz_offset": 480}
    )
    data = resp.json()
    item = next(i for i in data if i["plan_id"] == child.id)
    assert item["day_avg_ttft"] == 500.0
    assert item["night_avg_ttft"] is None

    # With tz_offset=0, it should be Night
    resp = await auth_client.get(
        "/api/results/matrix", params={"days": 1, "tz_offset": 0}
    )
    data = resp.json()
    item = next(i for i in data if i["plan_id"] == child.id)
    assert item["day_avg_ttft"] is None
    assert item["night_avg_ttft"] == 500.0
