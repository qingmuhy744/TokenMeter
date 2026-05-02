import hashlib

import pytest
from httpx import AsyncClient, ASGITransport
from backend.main import app
from backend.models import User
from backend.auth import hash_password
from sqlalchemy import select


@pytest.fixture
async def auth_client(db_session):
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
async def test_create_and_list_plans(db_session, auth_client: AsyncClient):
    resp = await auth_client.post(
        "/api/plans",
        json={
            "name": "Test GPT",
            "api_type": "openai",
            "api_base": "https://api.openai.com/v1",
            "api_key": "sk-test",
            "model": "gpt-4o",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test GPT"

    resp = await auth_client.get("/api/plans")
    assert resp.status_code == 200
    plans = resp.json()
    assert len(plans) >= 1


@pytest.mark.asyncio
async def test_update_plan(db_session, auth_client: AsyncClient):
    resp = await auth_client.post(
        "/api/plans",
        json={
            "name": "To Update",
            "api_type": "openai",
            "api_base": "https://api.openai.com/v1",
            "api_key": "sk-test",
            "model": "gpt-4o",
        },
    )
    plan_id = resp.json()["id"]

    resp = await auth_client.put(f"/api/plans/{plan_id}", json={"name": "Updated"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated"


@pytest.mark.asyncio
async def test_delete_plan(db_session, auth_client: AsyncClient):
    resp = await auth_client.post(
        "/api/plans",
        json={
            "name": "To Delete",
            "api_type": "openai",
            "api_base": "https://api.openai.com/v1",
            "api_key": "sk-test",
            "model": "gpt-4o",
        },
    )
    plan_id = resp.json()["id"]

    resp = await auth_client.delete(f"/api/plans/{plan_id}")
    assert resp.status_code == 200

    resp = await auth_client.get(f"/api/plans/{plan_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_export_plans(db_session, auth_client: AsyncClient):
    # Create a plan first
    await auth_client.post(
        "/api/plans",
        json={
            "name": "Export Test",
            "api_type": "openai",
            "api_base": "https://api.openai.com/v1",
            "api_key": "sk-export-test",
            "model": "gpt-4o",
            "test_count": 5,
        },
    )

    resp = await auth_client.get("/api/plans/export")
    assert resp.status_code == 200
    assert (
        resp.headers["content-disposition"]
        == "attachment; filename=tokenmeter-plans.json"
    )

    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1

    # Check if fields are correct
    plan = next(p for p in data if p["name"] == "Export Test")
    assert plan["api_type"] == "openai"
    assert plan["test_count"] == 5
    assert plan["api_key"] == "sk-export-test"
    assert "id" not in plan
    assert "created_at" not in plan
    assert "updated_at" not in plan


@pytest.mark.asyncio
async def test_import_plans(db_session, auth_client: AsyncClient):
    # First, create an existing plan to test collision
    await auth_client.post(
        "/api/plans",
        json={
            "name": "Collision Test",
            "api_type": "openai",
            "api_base": "https://api.openai.com/v1",
            "api_key": "sk-initial",
            "model": "gpt-4o",
        },
    )

    import_data = [
        {
            "name": "New Plan",
            "api_type": "anthropic",
            "api_base": "https://api.anthropic.com/v1",
            "api_key": "sk-ant",
            "model": "claude-3-sonnet",
        },
        {
            "name": "Collision Test",
            "api_type": "openai",
            "api_base": "https://api.openai.com/v2",
            "api_key": "sk-second",
            "model": "gpt-4-turbo",
        },
    ]

    resp = await auth_client.post("/api/plans/import", json=import_data)
    assert resp.status_code == 200
    assert resp.json()["count"] == 2

    # Verify both plans were imported
    resp = await auth_client.get("/api/plans")
    plans = resp.json()

    new_plan = next(p for p in plans if p["name"] == "New Plan")
    assert new_plan["api_type"] == "anthropic"

    # Verify collision handling
    collision_plan = next(p for p in plans if p["name"] == "Collision Test (Imported)")
    assert collision_plan["api_type"] == "openai"
    assert collision_plan["api_base"] == "https://api.openai.com/v2"

    # Test double collision
    import_data_2 = [
        {
            "name": "Collision Test",
            "api_type": "openai",
            "api_base": "https://api.openai.com/v3",
            "api_key": "sk-third",
            "model": "gpt-3.5-turbo",
        }
    ]
    resp = await auth_client.post("/api/plans/import", json=import_data_2)
    assert resp.status_code == 200

    resp = await auth_client.get("/api/plans")
    plans = resp.json()
    double_collision = next(
        p for p in plans if p["name"] == "Collision Test (Imported) (Imported)"
    )
    assert double_collision["api_base"] == "https://api.openai.com/v3"
