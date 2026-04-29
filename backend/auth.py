import secrets
import bcrypt
from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from backend.database import async_session
from backend.models import User
from backend.schemas import LoginRequest, ChangePasswordRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_KEY = "user_id"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def generate_password(length: int = 16) -> str:
    return secrets.token_urlsafe(length)[:length]


async def get_current_user(request: Request) -> User:
    user_id = request.session.get(SESSION_KEY)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    async with async_session() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.post("/login")
async def login(body: LoginRequest, request: Request):
    async with async_session() as db:
        result = await db.execute(select(User).where(User.username == body.username))
        user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
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
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Wrong old password")
    async with async_session() as db:
        result = await db.execute(select(User).where(User.id == user.id))
        u = result.scalar_one()
        u.password_hash = hash_password(body.new_password)
        await db.commit()
    return {"message": "Password changed"}


async def ensure_admin():
    """Create admin user with random password if not exists."""
    async with async_session() as db:
        result = await db.execute(select(User).where(User.username == "admin"))
        if result.scalar_one_or_none():
            return
        password = generate_password()
        admin = User(username="admin", password_hash=hash_password(password))
        db.add(admin)
        await db.commit()
        print("\n" + "=" * 50)
        print("  Admin account created!")
        print("  Username: admin")
        print(f"  Password: {password}")
        print("  Please change password after login")
        print("=" * 50 + "\n")
