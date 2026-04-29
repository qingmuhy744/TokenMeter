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
async def test_create_and_list_plans(auth_client: AsyncClient):
    resp = await auth_client.post("/api/plans", json={
        "name": "Test GPT",
        "api_type": "openai",
        "api_base": "https://api.openai.com/v1",
        "api_key": "sk-test",
        "model": "gpt-4o",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test GPT"

    resp = await auth_client.get("/api/plans")
    assert resp.status_code == 200
    plans = resp.json()
    assert len(plans) >= 1


@pytest.mark.asyncio
async def test_update_plan(auth_client: AsyncClient):
    resp = await auth_client.post("/api/plans", json={
        "name": "To Update",
        "api_type": "openai",
        "api_base": "https://api.openai.com/v1",
        "api_key": "sk-test",
        "model": "gpt-4o",
    })
    plan_id = resp.json()["id"]

    resp = await auth_client.put(f"/api/plans/{plan_id}", json={"name": "Updated"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated"


@pytest.mark.asyncio
async def test_delete_plan(auth_client: AsyncClient):
    resp = await auth_client.post("/api/plans", json={
        "name": "To Delete",
        "api_type": "openai",
        "api_base": "https://api.openai.com/v1",
        "api_key": "sk-test",
        "model": "gpt-4o",
    })
    plan_id = resp.json()["id"]

    resp = await auth_client.delete(f"/api/plans/{plan_id}")
    assert resp.status_code == 200

    resp = await auth_client.get(f"/api/plans/{plan_id}")
    assert resp.status_code == 404
