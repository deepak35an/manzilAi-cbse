import redis.asyncio as aioredis
from app.config import settings

redis_pool: aioredis.Redis | None = None


async def init_redis() -> aioredis.Redis:
    global redis_pool
    redis_pool = aioredis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        health_check_interval=30,
    )
    await redis_pool.ping()
    return redis_pool


async def close_redis():
    global redis_pool
    if redis_pool:
        await redis_pool.close()
        redis_pool = None


def get_redis_pool() -> aioredis.Redis:
    if redis_pool is None:
        raise RuntimeError("Redis not initialized")
    return redis_pool
