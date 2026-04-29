import pytest
from httpx import AsyncClient, ASGITransport
from backend.main import app
from backend.database import async_session
from backend.models import User
from backend.auth import hash_password
from sqlalchemy import select


@pytest.fixture
async def auth_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create a test user with known password
        async with async_session() as db:
            result = await db.execute(select(User).where(User.username == "testadmin"))
            existing = result.scalar_one_or_none()
            if not existing:
                db.add(User(username="testadmin", password_hash=hash_password("testpass")))
                await db.commit()

        await client.post("/api/auth/login", json={"username": "testadmin", "password": "testpass"})
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
