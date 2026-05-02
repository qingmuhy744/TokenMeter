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
async def test_get_settings(auth_client: AsyncClient):
    resp = await auth_client.get("/api/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert "default_prompt" in data
    assert "timeout_seconds" in data


@pytest.mark.asyncio
async def test_update_settings(auth_client: AsyncClient):
    resp = await auth_client.put("/api/settings", json={"timeout_seconds": 60})
    assert resp.status_code == 200

    resp = await auth_client.get("/api/settings")
    assert resp.json()["timeout_seconds"] == 60
