import time
from fastapi import Request, HTTPException, status
import redis.asyncio as aioredis

from app.redis_client import get_redis_pool


async def rate_limit_middleware(request: Request, calls: int = 60, period: int = 60):
    """Token bucket rate limiter using Redis."""
    redis = get_redis_pool()
    client_ip = request.client.host if request.client else "unknown"
    key = f"ratelimit:{client_ip}:{request.url.path}"

    pipe = redis.pipeline()
    now = time.time()
    window_start = now - period

    pipe.zremrangebyscore(key, 0, window_start)
    pipe.zadd(key, {str(now): now})
    pipe.zcard(key)
    pipe.expire(key, period)
    results = await pipe.execute()

    request_count = results[2]
    if request_count > calls:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
        )
