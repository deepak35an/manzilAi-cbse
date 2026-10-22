from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.database import AsyncSessionLocal
from app.redis_client import get_redis_pool


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_redis() -> aioredis.Redis:
    return get_redis_pool()
