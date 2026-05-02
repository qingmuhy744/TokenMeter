import asyncio
from backend.database import engine
from backend.migrations.manager import get_current_version
from sqlalchemy.ext.asyncio import AsyncSession


async def check():
    async with AsyncSession(engine) as db:
        version = await get_current_version(db)
        print(f"Current version: {version}")


if __name__ == "__main__":
    asyncio.run(check())
