"""CLI commands for TokenMeter administration."""

import asyncio
import hashlib
import sys

import bcrypt
from sqlalchemy import select

from backend.config import settings
from backend.database import async_session
from backend.models import User


async def reset_password(username: str | None = None):
    """Reset a user's password and print the new setup key."""
    target = username or settings.ADMIN_USER
    async with async_session() as db:
        result = await db.execute(select(User).where(User.username == target))
        user = result.scalar_one_or_none()
        if not user:
            print(f"Error: User '{target}' not found.")
            sys.exit(1)

        import secrets

        setup_token = secrets.token_urlsafe(16)
        client_hash = hashlib.sha256(setup_token.encode()).hexdigest()
        user.password_hash = bcrypt.hashpw(
            client_hash.encode(), bcrypt.gensalt()
        ).decode()
        await db.commit()

    print(f"\nPassword reset for user: {target}")
    print(f"New setup key: {setup_token}\n")


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m backend.cli <command> [args]")
        print("\nCommands:")
        print("  reset-password [username]  Reset a user's password (default: admin)")
        sys.exit(1)

    command = sys.argv[1]
    if command == "reset-password":
        username = sys.argv[2] if len(sys.argv) > 2 else None
        asyncio.run(reset_password(username))
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
