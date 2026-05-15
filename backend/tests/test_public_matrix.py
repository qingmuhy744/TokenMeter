from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from backend.main import app
from backend.models import TestResult, TokenPlan


@pytest.mark.asyncio
async def test_public_matrix_no_auth_returns_child_plan_metrics(db_session):
    provider = TokenPlan(name="Public Provider", is_active=True)
    db_session.add(provider)
    await db_session.flush()

    child = TokenPlan(name="Public Model", parent_id=provider.id, is_active=True)
    db_session.add(child)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    db_session.add_all(
        [
            TestResult(
                plan_id=child.id,
                ttft_ms=120.0,
                tps_overall=40.0,
                tps_generate=50.0,
                created_at=now - timedelta(minutes=5),
            ),
            TestResult(
                plan_id=child.id,
                ttft_ms=240.0,
                tps_overall=20.0,
                tps_generate=30.0,
                created_at=now - timedelta(minutes=1),
            ),
        ]
    )
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="https://test") as client:
        response = await client.get(
            "/api/public/matrix", params={"days": 1, "tz_offset": 0, "mode": "all"}
        )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    item = data[0]
    assert item["plan_id"] == child.id
    assert item["full_name"] == "Public Provider > Public Model"
    assert item["latest_status"] == "success"
    assert item["avg_ttft"] == 180.0
    assert item["avg_tps_overall"] == 30.0
    assert item["success_rate"] == 1.0


@pytest.mark.asyncio
async def test_public_matrix_filters_root_providers(db_session):
    provider = TokenPlan(name="Only Provider", is_active=True)
    db_session.add(provider)
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="https://test") as client:
        response = await client.get("/api/public/matrix")

    assert response.status_code == 200
    assert response.json() == []
