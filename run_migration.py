import asyncio
import logging
from backend.database import init_db


async def main():
    logging.basicConfig(level=logging.INFO)
    await init_db()
    print("Migration finished.")


if __name__ == "__main__":
    asyncio.run(main())
