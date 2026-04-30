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

        async with async_session() as db:
            import hashlib
            from sqlalchemy import delete

            # Clear any existing test user to ensure fresh credentials
            await db.execute(delete(User).where(User.username == "testadmin"))
            await db.commit()

            pw_hash = hashlib.sha256("testpass".encode()).hexdigest()
            db.add(User(username="testadmin", password_hash=hash_password(pw_hash)))
            await db.commit()

        pw_hash = hashlib.sha256("testpass".encode()).hexdigest()
        resp = await client.post(
            "/api/auth/login", json={"username": "testadmin", "password": pw_hash}
        )
        assert resp.status_code == 200

        resp = await client.get("/api/auth/me")
        assert resp.status_code == 200
        assert resp.json()["username"] == "testadmin"
