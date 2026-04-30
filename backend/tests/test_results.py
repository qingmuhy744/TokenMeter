import hashlib

import pytest
from httpx import AsyncClient, ASGITransport

from backend.main import app
from backend.models import User
from backend.auth import hash_password
from sqlalchemy import select


@pytest.fixture
async def auth_client(db_session):
    """Create an authenticated test client using the shared test db session."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        pw_hash = hashlib.sha256("testpass".encode()).hexdigest()
        result = await db_session.execute(
            select(User).where(User.username == "testadmin")
        )
        existing = result.scalar_one_or_none()
        if not existing:
            db_session.add(
                User(username="testadmin", password_hash=hash_password(pw_hash))
            )
            await db_session.commit()

        await client.post(
            "/api/auth/login", json={"username": "testadmin", "password": pw_hash}
        )
        yield client


@pytest.mark.asyncio
async def test_list_results_empty(auth_client: AsyncClient):
    resp = await auth_client.get("/api/results")
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_stats_empty(auth_client: AsyncClient):
    resp = await auth_client.get("/api/results/stats", params={"plan_id": 999})
    assert resp.status_code == 200
    assert resp.json()["count"] == 0


@pytest.mark.asyncio
async def test_delete_result(auth_client: AsyncClient, db_session):
    from backend.models import TestResult
    import datetime

    # Create a dummy result
    res = TestResult(plan_id=1, created_at=datetime.datetime.now())
    db_session.add(res)
    await db_session.commit()
    res_id = res.id

    resp = await auth_client.delete(f"/api/results/{res_id}")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    # Verify deleted
    check = await db_session.execute(select(TestResult).where(TestResult.id == res_id))
    assert check.scalar_one_or_none() is None
