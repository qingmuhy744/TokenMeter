import hashlib

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from backend.auth import hash_password
from backend.main import app
from backend.models import User


@pytest.fixture
async def security_client(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="https://test") as client:
        password_hash = hashlib.sha256("testpass".encode()).hexdigest()
        result = await db_session.execute(
            select(User).where(User.username == "securityadmin")
        )
        if result.scalar_one_or_none() is None:
            db_session.add(
                User(
                    username="securityadmin",
                    password_hash=hash_password(password_hash),
                )
            )
            await db_session.commit()

        response = await client.post(
            "/api/auth/login",
            json={"username": "securityadmin", "password": password_hash},
        )
        assert response.status_code == 200
        yield client


@pytest.mark.asyncio
async def test_session_cookie_has_security_attributes(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="https://test") as client:
        password_hash = hashlib.sha256("testpass".encode()).hexdigest()
        db_session.add(
            User(username="cookieadmin", password_hash=hash_password(password_hash))
        )
        await db_session.commit()

        response = await client.post(
            "/api/auth/login",
            json={"username": "cookieadmin", "password": password_hash},
        )

    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert "tokenmeter_session=" in cookie
    assert "httponly" in cookie.lower()
    assert "samesite=lax" in cookie.lower()
    assert "secure" in cookie.lower()


@pytest.mark.asyncio
async def test_plan_response_does_not_expose_raw_api_keys(security_client):
    create_response = await security_client.post(
        "/api/plans",
        json={
            "name": "Secret Parent",
            "api_type": "openai",
            "api_base": "https://api.openai.com/v1",
            "api_key": "sk-parent-secret",
            "model": "gpt-4",
        },
    )
    assert create_response.status_code == 200
    parent_id = create_response.json()["id"]

    child_response = await security_client.post(
        "/api/plans",
        json={
            "name": "Secret Child",
            "parent_id": parent_id,
            "model": "gpt-4o-mini",
        },
    )
    assert child_response.status_code == 200

    response = await security_client.get("/api/plans")
    assert response.status_code == 200
    for plan in response.json():
        assert "api_key" not in plan
        assert "effective_api_key" not in plan
        assert "sk-parent-secret" not in str(plan)
        assert "has_api_key" in plan
        assert "has_effective_api_key" in plan


@pytest.mark.asyncio
async def test_public_status_returns_banner_as_plain_string(security_client):
    payload = "<script>alert(1)</script><b>maintenance</b>"
    response = await security_client.put(
        "/api/settings", json={"custom_banner": payload}
    )
    assert response.status_code == 200

    public_response = await security_client.get("/api/public/status")
    assert public_response.status_code == 200
    assert public_response.json()["custom_banner"] == payload
