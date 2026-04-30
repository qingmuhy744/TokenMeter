import pytest
from httpx import AsyncClient, ASGITransport
from backend.main import app


@pytest.mark.asyncio
async def test_me_requires_auth():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_creates_session():
    from backend.database import init_db

    await init_db()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        from backend.database import async_session
        from backend.models import User
        from backend.auth import hash_password
        from sqlalchemy import select

        async with async_session() as db:
            result = await db.execute(select(User).where(User.username == "testadmin"))
            existing = result.scalar_one_or_none()
            if not existing:
                db.add(
                    User(username="testadmin", password_hash=hash_password("testpass"))
                )
                await db.commit()

        resp = await client.post(
            "/api/auth/login", json={"username": "testadmin", "password": "testpass"}
        )
        assert resp.status_code == 200

        resp = await client.get("/api/auth/me")
        assert resp.status_code == 200
        assert resp.json()["username"] == "testadmin"
