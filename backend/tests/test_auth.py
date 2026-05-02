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


@pytest.mark.asyncio
async def test_logout(db_session):
    from httpx import AsyncClient, ASGITransport
    from backend.main import app
    from backend.auth import hash_password, async_session
    from backend.models import User
    import hashlib

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Login
        async with async_session() as db:
            pw_hash = hashlib.sha256("testpass".encode()).hexdigest()
            db.add(User(username="logout_user", password_hash=hash_password(pw_hash)))
            await db.commit()

        await client.post(
            "/api/auth/login", json={"username": "logout_user", "password": pw_hash}
        )

        # 2. Verify /me works
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 200

        # 3. Logout
        resp = await client.post("/api/auth/logout")
        assert resp.status_code == 200

        # 4. Verify /me fails
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_change_password_success(db_session):
    from httpx import AsyncClient, ASGITransport
    from backend.main import app
    from backend.auth import hash_password, async_session
    from backend.models import User
    import hashlib

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Setup user
        async with async_session() as db:
            old_pw_hash = hashlib.sha256("oldpass".encode()).hexdigest()
            db.add(User(username="pw_user", password_hash=hash_password(old_pw_hash)))
            await db.commit()

        await client.post(
            "/api/auth/login", json={"username": "pw_user", "password": old_pw_hash}
        )

        # 2. Change password
        new_pw_hash = hashlib.sha256("newpass".encode()).hexdigest()
        resp = await client.post(
            "/api/auth/change-password",
            json={"old_password": old_pw_hash, "new_password": new_pw_hash},
        )
        assert resp.status_code == 200

        # 3. Verify logout and login with NEW password
        await client.post("/api/auth/logout")
        resp = await client.post(
            "/api/auth/login", json={"username": "pw_user", "password": new_pw_hash}
        )
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_change_password_wrong_old(db_session):
    from httpx import AsyncClient, ASGITransport
    from backend.main import app
    from backend.auth import hash_password, async_session
    from backend.models import User
    import hashlib

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with async_session() as db:
            old_pw_hash = hashlib.sha256("oldpass".encode()).hexdigest()
            db.add(
                User(username="pw_user_fail", password_hash=hash_password(old_pw_hash))
            )
            await db.commit()

        await client.post(
            "/api/auth/login",
            json={"username": "pw_user_fail", "password": old_pw_hash},
        )

        resp = await client.post(
            "/api/auth/change-password",
            json={"old_password": "wrong_old_hash", "new_password": "newpasshash"},
        )
        assert resp.status_code == 400


@pytest.mark.asyncio
async def test_login_rate_limiting(db_session):
    from httpx import AsyncClient, ASGITransport
    from backend.main import app
    from backend.auth import reset_rate_limit

    reset_rate_limit()  # Ensure clean start

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Attempt login with wrong password 5 times
        for _ in range(5):
            resp = await client.post(
                "/api/auth/login", json={"username": "admin", "password": "wrong"}
            )
            assert resp.status_code == 401

        # 6th attempt should be rate limited
        resp = await client.post(
            "/api/auth/login", json={"username": "admin", "password": "wrong"}
        )
        assert resp.status_code == 429
        assert "Too many login attempts" in resp.json()["detail"]

        # Reset and try again
        reset_rate_limit()
        resp = await client.post(
            "/api/auth/login", json={"username": "admin", "password": "wrong"}
        )
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_ensure_admin_logic(db_session):
    from backend.auth import ensure_admin
    from backend.models import User
    from sqlalchemy import select, delete

    # 1. Clear users
    await db_session.execute(delete(User))
    await db_session.commit()

    # 2. Call ensure_admin
    await ensure_admin()

    # 3. Verify user created
    result = await db_session.execute(select(User).where(User.username == "admin"))
    user = result.scalar_one_or_none()
    assert user is not None
    assert user.username == "admin"

    # 4. Call again, should not create duplicate
    await ensure_admin()
    result = await db_session.execute(select(User).where(User.username == "admin"))
    assert len(result.scalars().all()) == 1


@pytest.mark.asyncio
async def test_lifespan_calls_ensure_admin():
    from unittest.mock import patch, AsyncMock
    from backend.main import app, lifespan

    # We use a mock for ensure_admin and sync_scheduled_jobs to avoid DB side effects
    with (
        patch("backend.main.ensure_admin", new_callable=AsyncMock) as mock_admin,
        patch("backend.main.sync_scheduled_jobs", new_callable=AsyncMock),
        patch("backend.main.start_scheduler"),
        patch("backend.main.shutdown_scheduler"),
    ):
        async with lifespan(app):
            pass

        mock_admin.assert_called_once()
