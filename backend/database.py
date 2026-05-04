from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
import time

from loguru import logger

from backend.config import settings

engine = create_async_engine(
    settings.database_url, echo=False, pool_size=10, max_overflow=20, pool_timeout=60
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@event.listens_for(Engine, "checkout")
def receive_checkout(dbapi_connection, connection_record, connection_proxy):
    connection_record.info["checkout_time"] = time.time()


@event.listens_for(Engine, "checkin")
def receive_checkin(dbapi_connection, connection_record):
    if "checkout_time" in connection_record.info:
        duration = time.time() - connection_record.info["checkout_time"]
        if duration > 1.0:
            logger.warning(f"Connection held for {duration:.2f}s")


async def get_db():
    async with async_session() as session:
        yield session
