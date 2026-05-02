# Auth Testing Coverage Expansion Design

**Goal:** Increase `backend/auth.py` test coverage to ~100% by testing missing paths: logout, password change, rate limiting, and admin initialization.

**Architecture:**
- Extend `backend/tests/test_auth.py`.
- Use `MagicMock` to mock `Request.client.host` for rate limit testing.
- Utilize existing `auth_client` and `db_session` fixtures.

**Test Cases:**

1. `test_logout`:
   - Login, verify `/me` works (200).
   - POST `/api/auth/logout`.
   - Verify `/me` returns 401.

2. `test_change_password_success`:
   - Login with old password.
   - POST `/api/auth/change-password` with correct old password.
   - Verify success message.
   - Try logging in again with NEW password.
   - Verify login success.

3. `test_change_password_wrong_old`:
   - Login.
   - POST `/api/auth/change-password` with WRONG old password.
   - Verify 400 Bad Request.

4. `test_login_rate_limiting`:
   - Call `reset_rate_limit()` first.
   - Mock client IP.
   - Attempt login with wrong password 5 times (verify 401).
   - Attempt 6th time (verify 429).
   - Call `reset_rate_limit()` and verify 401 again.

5. `test_ensure_admin_logic`:
   - Clear users table.
   - Call `ensure_admin()`.
   - Verify `admin` user exists in DB.
   - Verify subsequent calls don't create duplicate users.

6. `test_lifespan_calls_ensure_admin`:
   - Use `unittest.mock` to patch `ensure_admin` in `backend.main`.
   - Use `async with lifespan(app)` to trigger lifespan events.
   - Verify mocked `ensure_admin` was called.

**Verification:**
- Run `uv run pytest backend/tests/test_auth.py --cov=backend/auth.py`.
- Target: >95% coverage for `auth.py`.
