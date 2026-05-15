import time
import secrets
import bcrypt
import hashlib
from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from backend.database import async_session
from backend.models import User
from backend.schemas import LoginRequest, ChangePasswordRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_KEY = "user_id"

# Simple in-memory rate limiter for login attempts
_login_attempts: dict[str, list[float]] = {}
_LOGIN_RATE_LIMIT = 5  # max attempts
_LOGIN_RATE_WINDOW = 300  # 5 minutes


def reset_rate_limit(ip: str | None = None) -> None:
    """Reset rate limiter for a specific IP or all IPs (for testing)."""
    if ip:
        _login_attempts.pop(ip, None)
    else:
        _login_attempts.clear()


def _check_rate_limit(ip: str) -> None:
    now = time.time()
    attempts = _login_attempts.get(ip, [])
    # Clean old entries
    attempts = [t for t in attempts if now - t < _LOGIN_RATE_WINDOW]
    if len(attempts) >= _LOGIN_RATE_LIMIT:
        raise HTTPException(
            status_code=429, detail="Too many login attempts. Try again in 5 minutes."
        )
    _login_attempts[ip] = attempts


def _record_failed_attempt(ip: str) -> None:
    now = time.time()
    attempts = _login_attempts.get(ip, [])
    attempts = [t for t in attempts if now - t < _LOGIN_RATE_WINDOW]
    attempts.append(now)
    _login_attempts[ip] = attempts


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def generate_password(length: int = 16) -> str:
    return secrets.token_urlsafe(length)[:length]


async def get_current_user(request: Request) -> User:
    if hasattr(request.state, "user"):
        return request.state.user

    user_id = request.session.get(SESSION_KEY)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    async with async_session() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    request.state.user = user
    return user


@router.post("/login")
async def login(body: LoginRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)
    async with async_session() as db:
        result = await db.execute(select(User).where(User.username == body.username))
        user = result.scalar_one_or_none()
    if not user or not verify_password(
        body.password.get_secret_value(), user.password_hash
    ):
        _record_failed_attempt(client_ip)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    reset_rate_limit(client_ip)
    request.session[SESSION_KEY] = user.id
    return {"message": "Logged in", "username": user.username}


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"message": "Logged out"}


@router.get("/me")
async def me(request: Request):
    user = await get_current_user(request)
    return {"id": user.id, "username": user.username}


@router.post("/change-password")
async def change_password(body: ChangePasswordRequest, request: Request):
    user = await get_current_user(request)
    if not verify_password(body.old_password.get_secret_value(), user.password_hash):
        raise HTTPException(status_code=400, detail="Wrong old password")
    async with async_session() as db:
        result = await db.execute(select(User).where(User.id == user.id))
        u = result.scalar_one()
        u.password_hash = hash_password(body.new_password.get_secret_value())
        await db.commit()
    return {"message": "Password changed"}


async def ensure_admin():
    """Create admin user with random password if not exists."""
    from backend.config import settings

    async with async_session() as db:
        result = await db.execute(
            select(User).where(User.username == settings.ADMIN_USER)
        )
        if result.scalar_one_or_none():
            return
        setup_token = generate_password()
        # Hash with SHA256 first because the frontend will send the SHA256 hash
        client_hash = hashlib.sha256(setup_token.encode()).hexdigest()
        admin = User(
            username=settings.ADMIN_USER, password_hash=hash_password(client_hash)
        )
        db.add(admin)
        await db.commit()
        print("\n" + "=" * 50)
        print("  Admin account created!")
        print(f"  Username: {settings.ADMIN_USER}")
        # lgtm[py/clear-text-logging-sensitive-data]
        print(f"  Initial setup key: {setup_token}")
        print("  Please change password after login")
        print("=" * 50 + "\n")
