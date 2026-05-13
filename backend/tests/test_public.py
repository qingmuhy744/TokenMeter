import pytest
from httpx import AsyncClient, ASGITransport
from backend.main import app


@pytest.mark.asyncio
async def test_public_status_no_auth(db_session):
    """Public status endpoint should work without authentication."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="https://test") as client:
        resp = await client.get("/api/public/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "plans" in data
        assert "range" in data
        assert data["range"] == "24h"


@pytest.mark.asyncio
async def test_public_status_range_param(db_session):
    """Status endpoint accepts range query parameter."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="https://test") as client:
        for r in ["24h", "7d", "30d"]:
            resp = await client.get(f"/api/public/status?range={r}")
            assert resp.status_code == 200
            assert resp.json()["range"] == r


@pytest.mark.asyncio
async def test_public_status_invalid_range(db_session):
    """Status endpoint rejects invalid range values."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="https://test") as client:
        resp = await client.get("/api/public/status?range=1y")
        assert resp.status_code == 422
