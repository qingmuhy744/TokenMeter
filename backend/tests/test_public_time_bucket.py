import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport

from backend.main import app
from backend.models import TokenPlan, TestResult


async def seed_fake_data(db_session):
    """Seed test data with multiple plans and staggered test results."""
    plan1 = TokenPlan(
        name="Plan A",
        api_type="openai",
        api_base="https://api.example.com",
        api_key="k1",
        model="gpt-4",
        is_active=True,
    )
    plan2 = TokenPlan(
        name="Plan B",
        api_type="anthropic",
        api_base="https://api.anthropic.com",
        api_key="k2",
        model="claude-3",
        is_active=True,
    )
    db_session.add_all([plan1, plan2])
    await db_session.flush()

    now = datetime.now(timezone.utc)

    # Plan A: tests at 10:00, 10:15, 10:30 (3 points in 30min = 10min buckets)
    for i, offset in enumerate([30, 15, 0]):
        tr = TestResult(
            plan_id=plan1.id,
            ttft_ms=100 + i * 10,
            tps_overall=50 + i,
            total_tokens=100,
            total_time_ms=2000,
            created_at=now - timedelta(minutes=offset),
        )
        db_session.add(tr)

    # Plan B: tests at 10:05, 10:35 (2 points in 30min = 10min buckets)
    for i, offset in enumerate([35, 5]):
        tr = TestResult(
            plan_id=plan2.id,
            ttft_ms=120 + i * 5,
            tps_overall=45,
            total_tokens=90,
            total_time_ms=2000,
            created_at=now - timedelta(minutes=offset),
        )
        db_session.add(tr)

    await db_session.commit()


@pytest.mark.asyncio
async def test_public_status_time_bucket_trend(db_session):
    """Test that trend data is properly time-bucketed and timestamps are valid ISO format."""
    await seed_fake_data(db_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/public/status?range=24h")
        assert resp.status_code == 200
        data = resp.json()

        for plan_data in data["plans"]:
            for point in plan_data["trend"]:
                ts = point["time"]
                assert ts.endswith("Z"), f"Timestamp should end with Z: {ts}"

                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                assert dt.tzinfo is not None

        plans_with_trend = [p for p in data["plans"] if p["trend"]]
        assert len(plans_with_trend) >= 1, "At least one plan should have trend data"


@pytest.mark.asyncio
async def test_public_status_invalid_date_check(db_session):
    """Verify no Invalid Date in response - timestamps must be parseable."""
    await seed_fake_data(db_session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/public/status?range=24h")
        data = resp.json()

        for plan_data in data["plans"]:
            for point in plan_data["trend"]:
                ts = point["time"]
                assert "Z" in ts or "+" in ts, f"Invalid timestamp format: {ts}"
