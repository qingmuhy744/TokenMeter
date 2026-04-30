from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
import logging
import time

from backend.config import settings

logger = logging.getLogger(__name__)

engine = create_async_engine(
    settings.database_url, echo=False, pool_size=10, max_overflow=20, pool_timeout=60
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@event.listens_for(Engine, "checkout")
def receive_checkout(dbapi_connection, connection_record, connection_proxy):
    connection_record.info["checkout_time"] = time.time()
    # logger.debug("Connection checked out")


@event.listens_for(Engine, "checkin")
def receive_checkin(dbapi_connection, connection_record):
    if "checkout_time" in connection_record.info:
        duration = time.time() - connection_record.info["checkout_time"]
        if duration > 1.0:  # Log connections held for more than 1 second
            logger.warning(f"Connection held for {duration:.2f}s")
    # logger.debug("Connection checked in")


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session


async def init_db():
    from backend.migrations.manager import run_migrations

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        await run_migrations(db)
