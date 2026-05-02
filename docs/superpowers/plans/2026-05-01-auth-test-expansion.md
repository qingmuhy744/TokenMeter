# Auth Testing Coverage Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase `backend/auth.py` test coverage to ~100% by testing missing paths: logout, password change, rate limiting, and admin initialization.

**Architecture:** Extend `backend/tests/test_auth.py` with new test cases. Use `unittest.mock` for rate limit and lifespan testing.

**Tech Stack:** Python, FastAPI, pytest, httpx, SQLAlchemy.

---

### Task 1: Logout and Password Change Tests

**Files:**
- Modify: `backend/tests/test_auth.py`

- [ ] **Step 1: Add logout test case**

Append this to `backend/tests/test_auth.py`:

```python
@pytest.mark.asyncio
async def test_logout(db_session):
    from httpx import AsyncClient, ASGITransport
    from backend.main import app
    from backend.auth import hash_password
    from backend.models import User
    import hashlib

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Login
        async with async_session() as db:
            pw_hash = hashlib.sha256("testpass".encode()).hexdigest()
            db.add(User(username="logout_user", password_hash=hash_password(pw_hash)))
            await db.commit()
        
        await client.post("/api/auth/login", json={"username": "logout_user", "password": pw_hash})
        
        # 2. Verify /me works
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 200
        
        # 3. Logout
        resp = await client.post("/api/auth/logout")
        assert resp.status_code == 200
        
        # 4. Verify /me fails
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 401
```

- [ ] **Step 2: Add password change success test case**

Append this to `backend/tests/test_auth.py`:

```python
@pytest.mark.asyncio
async def test_change_password_success(db_session):
    from httpx import AsyncClient, ASGITransport
    from backend.main import app
    from backend.auth import hash_password
    from backend.models import User
    import hashlib

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Setup user
        async with async_session() as db:
            old_pw_hash = hashlib.sha256("oldpass".encode()).hexdigest()
            db.add(User(username="pw_user", password_hash=hash_password(old_pw_hash)))
            await db.commit()
        
        await client.post("/api/auth/login", json={"username": "pw_user", "password": old_pw_hash})
        
        # 2. Change password
        new_pw_hash = hashlib.sha256("newpass".encode()).hexdigest()
        resp = await client.post("/api/auth/change-password", json={
            "old_password": old_pw_hash,
            "new_password": new_pw_hash
        })
        assert resp.status_code == 200
        
        # 3. Verify logout and login with NEW password
        await client.post("/api/auth/logout")
        resp = await client.post("/api/auth/login", json={"username": "pw_user", "password": new_pw_hash})
        assert resp.status_code == 200
```

- [ ] **Step 3: Add password change wrong old password test case**

Append this to `backend/tests/test_auth.py`:

```python
@pytest.mark.asyncio
async def test_change_password_wrong_old(db_session):
    from httpx import AsyncClient, ASGITransport
    from backend.main import app
    from backend.auth import hash_password
    from backend.models import User
    import hashlib

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with async_session() as db:
            old_pw_hash = hashlib.sha256("oldpass".encode()).hexdigest()
            db.add(User(username="pw_user_fail", password_hash=hash_password(old_pw_hash)))
            await db.commit()
        
        await client.post("/api/auth/login", json={"username": "pw_user_fail", "password": old_pw_hash})
        
        resp = await client.post("/api/auth/change-password", json={
            "old_password": "wrong_old_hash",
            "new_password": "newpasshash"
        })
        assert resp.status_code == 400
```

- [ ] **Step 4: Run tests to verify**

Run: `uv run pytest backend/tests/test_auth.py`

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_auth.py
git commit -m "test(auth): add logout and password change coverage"
```

---

### Task 2: Rate Limiting and Initialization Tests

**Files:**
- Modify: `backend/tests/test_auth.py`

- [ ] **Step 1: Add rate limiting test case**

Append this to `backend/tests/test_auth.py`:

```python
@pytest.mark.asyncio
async def test_login_rate_limiting(db_session):
    from httpx import AsyncClient, ASGITransport
    from backend.main import app
    from backend.auth import reset_rate_limit
    import hashlib

    reset_rate_limit() # Ensure clean start
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Attempt login with wrong password 5 times
        for _ in range(5):
            resp = await client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
            assert resp.status_code == 401
            
        # 6th attempt should be rate limited
        resp = await client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
        assert resp.status_code == 429
        assert "Too many login attempts" in resp.json()["detail"]
        
        # Reset and try again
        reset_rate_limit()
        resp = await client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
        assert resp.status_code == 401
```

- [ ] **Step 2: Add ensure_admin logic test case**

Append this to `backend/tests/test_auth.py`:

```python
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
```

- [ ] **Step 3: Add lifespan integration test case**

Append this to `backend/tests/test_auth.py`:

```python
@pytest.mark.asyncio
async def test_lifespan_calls_ensure_admin():
    from unittest.mock import patch, AsyncMock
    from backend.main import app, lifespan
    
    # We use a mock for ensure_admin and sync_scheduled_jobs to avoid DB side effects
    with patch("backend.main.ensure_admin", new_callable=AsyncMock) as mock_admin, \
         patch("backend.main.sync_scheduled_jobs", new_callable=AsyncMock), \
         patch("backend.main.start_scheduler"), \
         patch("backend.main.shutdown_scheduler"):
        
        async with lifespan(app):
            pass
            
        mock_admin.assert_called_once()
```

- [ ] **Step 4: Run all auth tests and check coverage**

Run: `uv run pytest backend/tests/test_auth.py --cov=backend/auth.py`
Expected: Coverage should be close to 100%.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_auth.py
git commit -m "test(auth): add rate limiting and admin initialization coverage"
```
