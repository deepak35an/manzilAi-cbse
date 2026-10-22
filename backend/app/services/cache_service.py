import json
import hashlib
from pathlib import Path
from typing import Optional

import aiofiles
import redis.asyncio as aioredis

from app.utils.logging import logger

CACHE_TTL = 3600  # 1 hour


async def get_cached_questions(
    content_registry_id: str,
    file_path: str,
    redis: aioredis.Redis,
) -> Optional[dict | list]:
    """Read-through cache for question bank JSON files."""
    cache_key = f"qbank:{content_registry_id}"

    cached = await redis.get(cache_key)
    if cached:
        data = json.loads(cached)
        stored_hash = data.get("_file_hash") if isinstance(data, dict) else None
        if stored_hash:
            current_hash = await _compute_file_hash_async(file_path)
            if current_hash == stored_hash:
                logger.info("cache_hit", key=cache_key)
                if "_questions" in data:
                    return data["_questions"]
                return data
            else:
                logger.info("cache_stale", key=cache_key)
                await redis.delete(cache_key)

    return await _load_and_cache(content_registry_id, file_path, redis)


async def _load_and_cache(
    content_registry_id: str,
    file_path: str,
    redis: aioredis.Redis,
) -> Optional[dict | list]:
    """Load from filesystem and populate cache."""
    full_path = Path(file_path)
    if not full_path.exists():
        return None

    async with aiofiles.open(full_path, "r", encoding="utf-8") as f:
        content = await f.read()


    data = json.loads(content)
    file_hash = hashlib.md5(content.encode()).hexdigest()

    if isinstance(data, list):
        cache_wrapper = {"_questions": data, "_file_hash": file_hash}
    else:
        data["_file_hash"] = file_hash
        cache_wrapper = data

    await redis.setex(
        f"qbank:{content_registry_id}",
        CACHE_TTL,
        json.dumps(cache_wrapper),
    )
    logger.info("cache_populated", registry_id=content_registry_id)
    return data


async def invalidate_cache(content_registry_id: str, redis: aioredis.Redis):
    cache_key = f"qbank:{content_registry_id}"
    await redis.delete(cache_key)
    logger.info("cache_invalidated", key=cache_key)


async def _compute_file_hash_async(file_path: str) -> Optional[str]:
    try:
        async with aiofiles.open(file_path, "rb") as f:
            content = await f.read()
        return hashlib.md5(content).hexdigest()
    except FileNotFoundError:
        return None
